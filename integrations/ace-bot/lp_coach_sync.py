"""Small push adapter from the existing AceBot/Kotyara to LP Coach.

AceBot remains the Telegram interface and keeps its SQLite cache. LP Coach is the
central PostgreSQL source of truth. Missing configuration disables the adapter.
"""

from __future__ import annotations

from datetime import datetime, timedelta
import logging
import os

import aiohttp

logger = logging.getLogger(__name__)

SYNC_URL = os.getenv(
    "LP_COACH_SYNC_URL",
    "https://lpvolley.ru/api/coach/integrations/kotyara/sync",
).strip()
SYNC_SECRET = os.getenv("LP_COACH_SYNC_SECRET", "").strip()

TELEGRAM_STATUS = {
    "yes": "going",
    "maybe": "maybe",
    "no": "not_going",
}


def _ends_at(starts_at: str, duration_seconds: int) -> str:
    start = datetime.fromisoformat(starts_at)
    return (start + timedelta(seconds=max(60, duration_seconds))).isoformat()


def _payload(event: dict, votes: list[dict] | None = None) -> dict:
    event_status = event.get("event_status") or event.get("status") or "active"
    return {
        "eventKey": f"yclients:{event['yclients_activity_id']}",
        "title": event.get("title") or "Тренировка по пляжному волейболу",
        "startsAt": event["starts_at"],
        "endsAt": _ends_at(event["starts_at"], int(event.get("duration_seconds") or 3600)),
        "status": "cancelled" if event_status == "cancelled" else "scheduled",
        "location": "",
        "courtCount": 1,
        "capacity": int(event.get("capacity") or 0) or None,
        "yclientsRecordsCount": int(event.get("records_count") or 0),
        "yclientsEventId": str(event["yclients_activity_id"]),
        "telegramChatId": str(event["chat_id"]) if event.get("chat_id") is not None else None,
        "telegramMessageId": str(event["message_id"]) if event.get("message_id") is not None else None,
        "metadata": {
            "bookingUrl": event.get("booking_url") or "",
            "serviceId": event.get("service_id"),
            "kotyaraPollId": event.get("id") if event.get("chat_id") is not None else None,
        },
        "participants": [
            {
                "provider": "telegram",
                "externalId": str(vote["user_id"]),
                "displayName": vote.get("user_name") or f"Telegram {vote['user_id']}",
                "username": vote.get("username") or "",
                "telegramStatus": TELEGRAM_STATUS.get(vote.get("choice"), "unknown"),
                "yclientsStatus": "unknown",
                "metadata": {"kotyaraPollId": event.get("id")},
            }
            for vote in (votes or [])
        ],
    }


async def push_training_snapshot(event: dict, votes: list[dict] | None = None) -> bool:
    """Push one idempotent snapshot; never interrupt Kotyara if LP Coach is down."""
    if not SYNC_SECRET or len(SYNC_SECRET) < 32 or not SYNC_URL:
        return False
    try:
        timeout = aiohttp.ClientTimeout(total=10)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                SYNC_URL,
                json=_payload(event, votes),
                headers={"Authorization": f"Bearer {SYNC_SECRET}"},
            ) as response:
                if response.status >= 400:
                    body = (await response.text())[:300]
                    logger.warning("LP Coach sync rejected %s: %s", response.status, body)
                    return False
                result = await response.json()
                logger.info(
                    "LP Coach: session %s, duplicate=%s, participants=%s",
                    result.get("sessionId"), result.get("duplicate"), result.get("participantCount"),
                )
                return True
    except Exception as exc:
        logger.warning("LP Coach sync unavailable: %s", exc)
        return False


async def push_open_poll_snapshots() -> int:
    """One-time/recovery sync for polls and votes already stored by Kotyara."""
    import database as db

    pushed = 0
    for poll_summary in await db.get_open_training_polls():
        poll_id = int(poll_summary["id"])
        poll = await db.get_training_poll(poll_id)
        if not poll:
            continue
        votes = await db.get_training_votes(poll_id)
        pushed += int(await push_training_snapshot(poll, votes))
    return pushed


async def push_upcoming_event_snapshots() -> int:
    """Push Kotyara's already-synced YCLIENTS cache without another network fetch."""
    import database as db

    pushed = 0
    now_iso = datetime.now().astimezone().isoformat()
    for event in await db.get_upcoming_training_events(now_iso, limit=100):
        pushed += int(await push_training_snapshot(event))
    return pushed
