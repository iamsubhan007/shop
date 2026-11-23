import Image from 'next/image';

// Pictures stored on this site (the public folder, or uploaded through the admin) go through next/image: the right size
// for the screen, modern formats (AVIF/WebP) and lazy loading. Anything else (an outside link, a data: URL) is shown as a
// plain image, because next/image only serves pictures that belong to this site and would refuse the others.
export default function SafeImage({ src, alt, fill, className, priority, sizes, width, height, ...rest }) {
  if (!src) return null;
  if (typeof src === 'string' && src.startsWith('/') && !src.startsWith('//')) {
    return <Image src={src} alt={alt} fill={fill} className={className} priority={priority} sizes={sizes} width={width} height={height} {...rest} />;
  }
  const style = fill ? { position: 'absolute', inset: 0, width: '100%', height: '100%' } : undefined;
  return <img src={src} alt={alt} className={className} style={style} width={width} height={height} loading={priority ? 'eager' : 'lazy'} decoding="async" />;
}
