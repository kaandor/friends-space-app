import React from 'react'

const s = (v: string, c: React.ReactNode, p?: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox={v} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg" {...p}>{c}</svg>
)
export const IconHome = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></>, p2)

export const IconAdd = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>, p2)

export const IconPlus = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>, p2)

export const IconServer = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><circle cx="12" cy="12" r="10" /><circle cx="12" cy="10" r="3" /><path d="M7 20.662V19a2 2 0 012-2h6a2 2 0 012 2v1.662" /></>, p2)

export const IconHash = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /><line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" /></>, p2)

export const IconVoice = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></>, p2)

export const IconMute = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" /><path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></>, p2)

export const IconDeafen = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></>, p2)

export const IconScreenShare = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></>, p2)

export const IconCall = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" /></>, p2)

export const IconEndCall = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91" /><line x1="23" y1="1" x2="1" y2="23" /></>, p2)

export const IconFriend = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></>, p2)

export const IconSettings = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></>, p2)

export const IconEdit = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></>, p2)

export const IconDelete = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></>, p2)

export const IconSend = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></>, p2)

export const IconAttach = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></>, p2)

export const IconMic = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></>, p2)

export const IconHeadphone = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><path d="M3 18v-6a9 9 0 0118 0v6" /><path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z" /></>, p2)

export const IconUser = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></>, p2)

export const IconMenu = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></>, p2)

export const IconClose = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>, p2)

export const IconSearch = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>, p2)

export const IconLink = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></>, p2)

export const IconCopy = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></>, p2)

export const IconShield = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></>, p2)

export const IconStop = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><rect x="6" y="6" width="12" height="12" rx="2" /></>, p2)

export const IconRecord = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" fill="currentColor" /></>, p2)

export const IconDownload = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>, p2)

export const IconArrowBack = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></>, p2)

export const IconMore = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></>, p2)

export const IconCamera = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></>, p2)

export const IconCheck = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><polyline points="20 6 9 17 4 12" /></>, p2)

export const IconCrown = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><path d="M2 19l3-14 4 6 3-8 3 8 4-6 3 14z" fill="currentColor" stroke="none" /></>, p2)

export const IconAudioFile = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>, p2)

export const IconNotification = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></>, p2)

export const IconSun = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></>, p2)

export const IconMoon = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></>, p2)
export const IconVolume = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" /></>, p2)
export const IconVolumeX = (p2?: React.SVGProps<SVGSVGElement>) => s('0 0 24 24', <><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></>, p2)
