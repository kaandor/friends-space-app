import React from 'react'

const s = (v: string, c: React.ReactNode, p?: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox={v} fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" shapeRendering="geometricPrecision" width={20} height={20} xmlns="http://www.w3.org/2000/svg" {...p}>{c}</svg>
)
export const IconHome = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><path d="M15 21v-8a1 1 0 00-1-1h-4a1 1 0 00-1 1v8" /><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21a1 1 0 001 1h12a1 1 0 001-1V9.5" /></>, p2)

export const IconAdd = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>, p2)

export const IconPlus = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>, p2)

export const IconMute = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v1a7 7 0 0014 0v-1" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="2" y1="2" x2="22" y2="22" /></>, p2)

export const IconDeafen = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><path d="M3 18v-6a9 9 0 0118 0v6" /><path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z" /><line x1="2" y1="2" x2="22" y2="22" /></>, p2)

export const IconScreenShare = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></>, p2)

export const IconEndCall = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><path d="M10.7 13.3a16 16 0 003.4 2.6l1.3-1.3a2 2 0 012.1-.45c.9.34 1.84.57 2.8.7a2 2 0 011.7 2v1.2" /><path d="M2.1 4.2A19.8 19.8 0 015.2 12.8a19.5 19.5 0 006 6 19.8 19.8 0 008.6 3.1" opacity="0.45" /><line x1="23" y1="1" x2="1" y2="23" /></>, p2)

export const IconSettings = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></>, p2)

export const IconSend = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><path d="M22 2 11 13" /><path d="M22 2l-7 20-4-9-9-4z" /></>, p2)

export const IconMic = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v1a7 7 0 0014 0v-1" /><line x1="12" y1="18" x2="12" y2="22" /></>, p2)

export const IconHeadphone = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><path d="M4 14v-2a8 8 0 0116 0v2" /><rect x="3" y="14" width="4" height="7" rx="2" /><rect x="17" y="14" width="4" height="7" rx="2" /></>, p2)

export const IconClose = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>, p2)

export const IconSearch = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>, p2)

export const IconLink = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></>, p2)

export const IconShield = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></>, p2)

export const IconStop = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><rect x="6" y="6" width="12" height="12" rx="2" /></>, p2)

export const IconCheck = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><polyline points="20 6 9 17 4 12" /></>, p2)

export const IconCrown = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><path d="M2 19l3-14 4 6 3-8 3 8 4-6 3 14z" fill="currentColor" stroke="none" /></>, p2)

export const IconNotification = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 01-3.4 0" /><circle cx="18.5" cy="5.5" r="2.2" fill="currentColor" stroke="none" opacity="0.9" /></>, p2)

export const IconVolume = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" /></>, p2)

export const IconMicOff = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v1a7 7 0 0014 0v-1" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="2" y1="2" x2="22" y2="22" /></>, p2)

export const IconHeadphonesOff = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><path d="M4 14v-2a8 8 0 0116 0v2" /><rect x="3" y="14" width="4" height="7" rx="2" /><rect x="17" y="14" width="4" height="7" rx="2" /><line x1="2" y1="2" x2="22" y2="22" /></>, p2)

export const IconGear = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><circle cx="12" cy="12" r="3.2" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" /></>, p2)

export const IconDisplay = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><rect x="2" y="4" width="20" height="12" rx="2" /><line x1="8" y1="20" x2="16" y2="20" /><line x1="12" y1="16" x2="12" y2="20" /></>, p2)

export const IconChat = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" /></>, p2)
