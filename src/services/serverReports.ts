import type { Report } from '../types'
import { requestBackend } from './backend'

export async function listServerReports(serverId: string): Promise<Report[]> {
  try {
    const result = await requestBackend<{ reports: Report[] }>('listServerReports', { serverId })
    return result?.reports || []
  } catch {
    return []
  }
}

export async function escalateReport(reportId: string) {
  try {
    const result = await requestBackend<{ report: Report }>('escalateReport', { reportId })
    return { report: result?.report, error: undefined as string | undefined }
  } catch (error) {
    return { report: undefined, error: error instanceof Error ? error.message : 'Erro ao escalar denúncia' }
  }
}
