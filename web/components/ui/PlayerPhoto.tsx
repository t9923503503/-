import Image from 'next/image';

/**
 * Player / avatar image: same-origin paths use next/image; http(s) URLs use <img>
 * so arbitrary external hosts (VK, etc.) work without remotePatterns.
 */
export default function PlayerPhoto({
  photoUrl,
  alt,
  width,
  height,
  className,
}: {
  photoUrl: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
}) {
  const url = String(photoUrl || '').trim();
  if (!url) return null;

  const cls = className ?? 'object-cover w-full h-full';
  if (/^https?:\/\//i.test(url)) {
    return (
      <img
        src={url}
        alt={alt}
        width={width}
        height={height}
        className={cls}
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    );
  }

  return <Image src={url} alt={alt} width={width} height={height} className={cls} />;
}
