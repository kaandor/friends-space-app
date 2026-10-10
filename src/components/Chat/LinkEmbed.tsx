import type { EmbedInfo } from '../../services/mediaDetect'

interface LinkEmbedProps {
  embed: EmbedInfo
}

export function LinkEmbed({ embed }: LinkEmbedProps) {
  const base = {
    borderRadius: 8,
    overflow: 'hidden',
    width: '100%',
    maxWidth: 440,
    marginTop: 6,
    background: '#000',
  } as const

  if (embed.type === 'spotify' || embed.type === 'soundcloud') {
    return (
      <iframe
        src={embed.url}
        title={embed.title || 'Audio'}
        width="100%"
        height={embed.type === 'spotify' ? 80 : 166}
        frameBorder="0"
        allow="encrypted-media"
        style={base}
        loading="lazy"
      />
    )
  }

  if (embed.type === 'x') {
    return (
      <iframe
        src={embed.url}
        title="Post"
        width="100%"
        height={420}
        frameBorder="0"
        scrolling="yes"
        style={base}
        loading="lazy"
      />
    )
  }

  if (embed.type === 'tiktok') {
    return (
      <iframe
        src={embed.url}
        title="TikTok"
        width="100%"
        height={580}
        frameBorder="0"
        scrolling="no"
        allow="autoplay; fullscreen"
        style={base}
        loading="lazy"
      />
    )
  }

  return (
    <iframe
      src={embed.url}
      title={embed.title || 'Video'}
      width="100%"
      height={Math.min(Math.round((440 * 9) / 16), 320)}
      frameBorder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowFullScreen
      style={base}
      loading="lazy"
    />
  )
}
