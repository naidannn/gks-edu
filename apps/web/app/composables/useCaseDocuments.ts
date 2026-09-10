import type {
  CaseConditions,
  DocStage,
  DocumentChecklist,
  DocumentStatus,
  OfficeAppointmentView,
  SignedFile,
} from '@gks/shared';

export interface ReviewPayload {
  action: 'ACCEPT' | 'REQUEST_FIX' | 'RETURN';
  note?: string;
}

export interface CaseDocumentsOptions {
  /**
   * Which stage's checklist this screen is for. An option rather than a ref
   * the caller assigns after the fact: `docs.stage.value = 'VISA'` tripped the
   * watcher below and fired a second `GET /documents?stage=…` on every mount,
   * including for cases that have no visa stage at all and whose first request
   * was going to 404 anyway.
   */
  stage?: DocStage;
}

/**
 * One case's material checklist (1D-13 … 1D-15). Both the client screen and the
 * staff workspace go through this, so the two never drift on how a document is
 * uploaded, transitioned or downloaded.
 */
export function useCaseDocuments(caseId: Ref<string> | string, options: CaseDocumentsOptions = {}) {
  const api = useApi();
  const config = useRuntimeConfig();
  const id = computed(() => (typeof caseId === 'string' ? caseId : caseId.value));

  const stage = ref<DocStage>(options.stage ?? 'ADMISSION');
  const checklist = ref<DocumentChecklist | null>(null);
  const conditions = ref<CaseConditions | null>(null);
  const pending = ref(false);
  const error = ref<string | null>(null);

  async function load() {
    pending.value = true;
    error.value = null;
    try {
      const [list, answers] = await Promise.all([
        api.get<DocumentChecklist>(`/cases/${id.value}/documents?stage=${stage.value}`),
        api.get<CaseConditions | null>(`/cases/${id.value}/conditions`),
      ]);
      checklist.value = list;
      conditions.value = answers;
    } catch (e) {
      error.value = apiErrorMessage(e, 'Материалын жагсаалтыг ачаалж чадсангүй');
    } finally {
      pending.value = false;
    }
  }

  /** Saving the questionnaire re-resolves the checklist server-side (1D-04). */
  async function saveConditions(payload: Partial<CaseConditions>) {
    await api.put(`/cases/${id.value}/conditions?stage=${stage.value}`, payload);
    await load();
  }

  /** `FormData` rather than JSON — the API validates the real bytes (0-09). */
  async function upload(documentId: string, files: File[]) {
    const body = new FormData();
    for (const file of files) body.append('files', file);
    await api.post(`/case-documents/${documentId}/files`, body);
    await load();
  }

  async function transition(documentId: string, toStatus: DocumentStatus, note?: string) {
    await api.post(`/case-documents/${documentId}/transitions`, { toStatus, note });
    await load();
  }

  async function review(documentId: string, payload: ReviewPayload) {
    await api.post(`/case-documents/${documentId}/review`, payload);
    await load();
  }

  async function addNote(documentId: string, body: string, isInternal = false) {
    await api.post(`/case-documents/${documentId}/notes`, { body, isInternal });
    await load();
  }

  async function removeFile(fileId: string) {
    await api.delete(`/document-files/${fileId}`);
    await load();
  }

  /** Mints a 5-minute signed token and returns the URL that serves the bytes (§9). */
  async function fileUrl(fileId: string): Promise<string> {
    const signed = await api.get<SignedFile>(`/document-files/${fileId}/url`);
    return `${config.public.apiBase}/files/${signed.token}`;
  }

  async function openFile(fileId: string) {
    window.open(await fileUrl(fileId), '_blank', 'noopener');
  }

  /** The checklist as an A4 handout (1D-21) — rendered on demand, never stored. */
  async function printChecklist(caseCode?: string) {
    const blob = await api.get<Blob>(`/cases/${id.value}/documents/print?stage=${stage.value}`, {
      responseType: 'blob',
    });
    openPdfBlob(blob, `Бүрдүүлэх материал-${caseCode ?? id.value}.pdf`);
  }

  function appointments() {
    return api.get<OfficeAppointmentView>(`/cases/${id.value}/appointments`);
  }

  function bookAppointment(scheduledAt: string, note?: string) {
    return api.post(`/cases/${id.value}/appointments`, { scheduledAt, note });
  }

  watch(stage, load);

  return {
    stage,
    checklist,
    conditions,
    pending,
    error,
    load,
    saveConditions,
    upload,
    transition,
    review,
    addNote,
    removeFile,
    fileUrl,
    openFile,
    printChecklist,
    appointments,
    bookAppointment,
  };
}
