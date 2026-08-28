-- Play V3 is scoped to Surgut. Repair venues created before migration 072
-- changed the column default from Yekaterinburg to Surgut.
UPDATE play_venues
SET city = 'Сургут',
    updated_at = now()
WHERE city IS DISTINCT FROM 'Сургут';
