import type { Report, ReportAttachment } from '../types'
import { requestBackend } from './backend'

export async function sendReportMessage(reportId: string, content: string, attachments: ReportAttachment[] = []) {
  try {
    const result = await requestBackend<{ report: Report }>('sendReportMessage', { reportId, content, attachments })
    return { report: result?.report, error: undefined as string | undefined }
  } catch (error) {
    return { report: undefined, error: error instanceof Error ? error.message : 'Erro ao enviar mensagem' }
  }
}

export type TicketStatus = 'open' | 'awaiting_user' | 'awaiting_support' | 'defense' | 'resolved'

export async function setReportStatus(reportId: string, status: TicketStatus, options?: { defenseOpen?: boolean; verdict?: string; punishment?: string; assign?: boolean }) {
  try {
    const result = await requestBackend<{ report: Report }>('setReportStatus', {
      reportId,
      status,
      ...options,
    })
    return { report: result?.report, error: undefined as string | undefined }
  } catch (error) {
    return { report: undefined, error: error instanceof Error ? error.message : 'Erro ao atualizar ticket' }
  }
}

export async function listMyDefenses(): Promise<Report[]> {
  try {
    return await requestBackend<Report[]>('getMyDefenses', {}) || []
  } catch {
    return []
  }
}
