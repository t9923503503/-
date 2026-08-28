import TournamentGallery from '@/components/landing/TournamentGallery';
import { getVkGallery } from '@/lib/vk-gallery';
import type { GalleryAlbum } from '@/lib/vk-gallery-core';

const FALLBACK_ALBUM: GalleryAlbum = {
  id: -1,
  title: 'Лютые турниры',
  description: 'Наши люди. Наш песок. Наши эмоции.',
  photoCount: 6,
  updatedAt: '',
  coverUrl: '/images/landing/tough-tournaments/tournament-1.jpg',
  vkUrl: 'https://vk.ru/albums-231914175',
  photos: [
    ['tournament-1.jpg', 1600, 1067, 'Общее фото участников турнира «Лютых пляжников» на крытой песчаной площадке'],
    ['tournament-2.jpg', 1600, 1066, 'Участники летнего турнира «Лютых пляжников» на открытой площадке'],
    ['tournament-3.jpg', 1600, 1067, 'Общее фото игроков после турнира по пляжному волейболу'],
    ['tournament-4.jpg', 1600, 1067, 'Команда участников летних игр «Лютых пляжников»'],
    ['tournament-5.jpg', 1600, 1067, 'Игроки турнира LPVOLLEY после матчей на песке'],
    ['tournament-6.jpg', 1600, 1067, 'Яркий момент турнира «Лютых пляжников»'],
  ].map(([filename, width, height, alt], index) => ({
    id: -(index + 1),
    thumbSrc: `/images/landing/tough-tournaments/${filename}`,
    fullSrc: `/images/landing/tough-tournaments/${filename}`,
    width: Number(width),
    height: Number(height),
    alt: String(alt),
    vkUrl: 'https://vk.ru/albums-231914175',
  })),
};

export default async function TournamentGalleryServer() {
  const remoteAlbums = await getVkGallery();
  const isFallback = remoteAlbums.length === 0;
  return <TournamentGallery albums={isFallback ? [FALLBACK_ALBUM] : remoteAlbums} isFallback={isFallback} />;
}
