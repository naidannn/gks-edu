<script setup lang="ts">
import type {
  AppointmentStatus,
  CalendarOfficeVisit,
  ClientListItem,
  ConsultationAppointment,
  ConsultationCalendar,
  ConsultationMode,
  LeadDetail,
  LeadListItem,
  OfficeWeekHours,
  PaginatedResult,
} from '@gks/shared';
import { useAuthStore } from '~/stores/auth';
import {
  addDays,
  gridBounds,
  minutesLabel,
  mondayOf,
  placeBlocks,
  slotTimes,
  ubInstant,
  ubParts,
  weekDays,
  type CalendarDay,
} from '~/utils/consultation-calendar';

/**
 * 1B-30 — the consultation calendar.
 *
 * Everybody who is coming in, in one week: the times the assistant agreed in
 * chat, the ones staff added for people who phoned or walked in, and clients'
 * visits to hand over originals (1D-11, read-only here). Saturday and Sunday
 * are full days off (2026-11-23); the week comes from the API with the
 * bookings, so the grid and the assistant cannot disagree about it.
 */
definePageMeta({ middleware: 'staff', layout: 'admin' });
useHead({ title: 'Зөвлөгөөний цаг · CRM' });

const SLOT_MINUTES = 30;
const DURATION_OPTIONS = [15, 30, 45, 60, 90].map((minutes) => ({ value: String(minutes), label: `${minutes} минут` }));
const MODE_OPTIONS = (Object.keys(CONSULTATION_MODE_LABELS) as ConsultationMode[]).map((mode) => ({
  value: mode,
  label: CONSULTATION_MODE_LABELS[mode],
}));
const MODE_ICON: Record<ConsultationMode, string> = { OFFICE: 'building-2', PHONE: 'phone', ONLINE: 'video' };

const api = useApi();
const auth = useAuthStore();
const route = useRoute();

// ─── the week ────────────────────────────────────────────────────────────────

const monday = ref(mondayOf(new Date()));
const hours = ref<OfficeWeekHours>({ 0: null, 1: [9, 18], 2: [9, 18], 3: [9, 18], 4: [9, 18], 5: [9, 18], 6: null });
const appointments = ref<ConsultationAppointment[]>([]);
const officeVisits = ref<CalendarOfficeVisit[]>([]);
const staff = ref<StaffMember[]>([]);
const pending = ref(true);
const loadError = ref(false);

const staffFilter = ref<string>('all');
const showCancelled = ref(false);

const days = computed(() => weekDays(monday.value, hours.value));
const bounds = computed(() => gridBounds(hours.value));
const rows = computed(() => slotTimes(bounds.value.start, bounds.value.end, SLOT_MINUTES));

const todayKey = ref(ubParts(new Date()).key);
const nowMinutes = ref(ubParts(new Date()).minutes);
let clock: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  clock = setInterval(() => {
    const parts = ubParts(new Date());
    todayKey.value = parts.key;
    nowMinutes.value = parts.minutes;
  }, 60_000);
});
onBeforeUnmount(() => clearInterval(clock));

const weekLabel = computed(() => {
  const first = days.value[0]!;
  const friday = days.value[4]!;
  const year = monday.value.slice(0, 4);
  return first.month === friday.month
    ? `${year} ${monthNameMn(first.month)} ${first.day}–${friday.day}`
    : `${year} ${monthNameMn(first.month)} ${first.day} – ${monthNameMn(friday.month)} ${friday.day}`;
});

async function load() {
  pending.value = true;
  loadError.value = false;
  try {
    const result = await api.get<ConsultationCalendar>('/consultation-appointments', {
      query: {
        from: ubInstant(monday.value, 0).toISOString(),
        to: ubInstant(addDays(monday.value, 7), 0).toISOString(),
      },
    });
    hours.value = result.hours;
    appointments.value = result.appointments;
    officeVisits.value = result.officeVisits;
  } catch {
    loadError.value = true;
  } finally {
    pending.value = false;
  }
}

watch(monday, load);

function shiftWeek(weeks: number) {
  monday.value = addDays(monday.value, weeks * 7);
}

function thisWeek() {
  monday.value = mondayOf(new Date());
}

// ─── what each day shows ────────────────────────────────────────────────────

const visible = computed(() =>
  appointments.value.filter((item) => {
    if (!showCancelled.value && item.status === 'CANCELLED') return false;
    if (staffFilter.value === 'mine') return item.staffId === auth.user?.id;
    if (staffFilter.value === 'unassigned') return !item.staffId;
    if (staffFilter.value !== 'all') return item.staffId === staffFilter.value;
    return true;
  }),
);

type Block =
  | { id: string; start: number; end: number; kind: 'consultation'; item: ConsultationAppointment }
  | { id: string; start: number; end: number; kind: 'visit'; item: CalendarOfficeVisit };

/** Timed blocks for one day, laid out into lanes. Office visits are 30 minutes — they carry no length. */
function blocksFor(day: CalendarDay) {
  const blocks: Block[] = [];
  for (const item of visible.value) {
    if (item.allDay) continue;
    const parts = ubParts(item.startsAt);
    if (parts.key !== day.key) continue;
    blocks.push({ id: item.id, start: parts.minutes, end: parts.minutes + item.durationMinutes, kind: 'consultation', item });
  }
  if (staffFilter.value === 'all') {
    for (const item of officeVisits.value) {
      const parts = ubParts(item.scheduledAt);
      if (parts.key !== day.key) continue;
      blocks.push({ id: item.id, start: parts.minutes, end: parts.minutes + SLOT_MINUTES, kind: 'visit', item });
    }
  }
  return placeBlocks(blocks);
}

/** Day-only bookings from the assistant: "comes some time that day". */
function allDayFor(day: CalendarDay) {
  return visible.value.filter((item) => item.allDay && ubParts(item.startsAt).key === day.key);
}

const blocksByDay = computed(() => Object.fromEntries(days.value.map((day) => [day.key, blocksFor(day)])));
const allDayByDay = computed(() => Object.fromEntries(days.value.map((day) => [day.key, allDayFor(day)])));
const hasAllDay = computed(() => days.value.some((day) => allDayByDay.value[day.key]!.length));

const weekCount = computed(() => visible.value.filter((item) => item.status !== 'CANCELLED').length);

const SLOT_HEIGHT = 34;

function blockStyle(placed: { block: Block; lane: number; lanes: number }) {
  const top = ((placed.block.start - bounds.value.start) / SLOT_MINUTES) * SLOT_HEIGHT;
  const height = Math.max(((placed.block.end - placed.block.start) / SLOT_MINUTES) * SLOT_HEIGHT - 2, 20);
  const width = 100 / placed.lanes;
  return { top: `${top}px`, height: `${height}px`, left: `calc(${placed.lane * width}% + 2px)`, width: `calc(${width}% - 4px)` };
}

function blockClass(block: Block) {
  // Half an hour has room for one line: time and name side by side, no consultant.
  const short = block.end - block.start <= SLOT_MINUTES;
  if (block.kind === 'visit') return { 'cal-block--visit': true, 'cal-block--short': short };
  return {
    'cal-block--short': short,
    'cal-block--done': block.item.status === 'COMPLETED',
    'cal-block--missed': block.item.status === 'NO_SHOW',
    'cal-block--cancelled': block.item.status === 'CANCELLED',
    'cal-block--ai': !block.item.createdBy,
  };
}

function isOpenSlot(day: CalendarDay, minute: number) {
  return !!day.hours && minute >= day.hours[0] * 60 && minute < day.hours[1] * 60;
}

const nowLineTop = computed(() => ((nowMinutes.value - bounds.value.start) / SLOT_MINUTES) * SLOT_HEIGHT);
const nowInGrid = computed(() => nowMinutes.value >= bounds.value.start && nowMinutes.value < bounds.value.end);

// ─── the side panel ─────────────────────────────────────────────────────────

type Panel =
  | { kind: 'new' }
  | { kind: 'edit'; item: ConsultationAppointment }
  | { kind: 'visit'; item: CalendarOfficeVisit }
  | null;

const panel = ref<Panel>(null);

interface Form {
  date: string;
  time: string;
  duration: string;
  mode: ConsultationMode;
  name: string;
  phone: string;
  note: string;
  staffId: string;
  leadId: string | null;
  clientId: string | null;
  /** What the linked record is called, for the chip. */
  linkLabel: string | null;
}

const form = reactive<Form>(emptyForm());
const formError = ref<string | null>(null);
const saving = ref(false);
const confirmDelete = ref(false);

function emptyForm(): Form {
  return {
    date: '',
    time: '',
    duration: '30',
    mode: 'OFFICE',
    name: '',
    phone: '',
    note: '',
    staffId: auth.user?.id ?? '',
    leadId: null,
    clientId: null,
    linkLabel: null,
  };
}

const formDayHours = computed(() => {
  if (!form.date) return null;
  return hours.value[ubParts(ubInstant(form.date, 12 * 60)).weekday] ?? null;
});

const timeOptions = computed(() => {
  const range = formDayHours.value;
  if (!range) return [];
  return slotTimes(range[0] * 60, range[1] * 60, 15).map((minute) => ({ value: minutesLabel(minute), label: minutesLabel(minute) }));
});

const formDayOff = computed(() => !!form.date && !formDayHours.value);

const staffOptions = computed(() => [
  { value: '', label: 'Хариуцагчгүй' },
  ...staff.value.map((member) => ({ value: member.id, label: member.name ?? member.email ?? '—' })),
]);

const filterOptions = computed(() => [
  { value: 'all', label: 'Бүх зөвлөх' },
  { value: 'mine', label: 'Зөвхөн миний' },
  { value: 'unassigned', label: 'Хариуцагчгүй' },
  ...staff.value.map((member) => ({ value: member.id, label: member.name ?? member.email ?? '—' })),
]);

/** The first open day from today on, for a booking started without a slot. */
function nextOpenDay(): string {
  let key = todayKey.value;
  for (let ahead = 0; ahead < 7; ahead += 1) {
    const weekday = ubParts(ubInstant(key, 12 * 60)).weekday;
    if (hours.value[weekday]) return key;
    key = addDays(key, 1);
  }
  return todayKey.value;
}

function openNew(day?: CalendarDay, minute?: number) {
  Object.assign(form, emptyForm());
  form.date = day?.key ?? nextOpenDay();
  form.time = minute !== undefined ? minutesLabel(minute) : '';
  formError.value = null;
  confirmDelete.value = false;
  personQuery.value = '';
  panel.value = { kind: 'new' };
}

function openEdit(item: ConsultationAppointment) {
  const parts = ubParts(item.startsAt);
  Object.assign(form, {
    date: parts.key,
    // A day-only booking has no hour yet; the form asks for one.
    time: item.allDay ? '' : minutesLabel(parts.minutes),
    duration: String(item.durationMinutes),
    mode: item.mode,
    name: item.name,
    phone: item.phone ?? '',
    note: item.note ?? '',
    staffId: item.staffId ?? '',
    leadId: item.leadId,
    clientId: item.clientId,
    linkLabel: item.client ? item.client.code : item.leadId ? 'Зөвлөгөө хүсэлт' : null,
  });
  formError.value = null;
  confirmDelete.value = false;
  personQuery.value = '';
  panel.value = { kind: 'edit', item };
}

function onBlock(block: Block) {
  if (block.kind === 'visit') panel.value = { kind: 'visit', item: block.item };
  else openEdit(block.item);
}

function payload() {
  const [h, m] = form.time.split(':').map(Number);
  return {
    startsAt: ubInstant(form.date, h! * 60 + m!).toISOString(),
    durationMinutes: Number(form.duration),
    mode: form.mode,
    name: form.name.trim(),
    phone: form.phone.trim() || null,
    note: form.note.trim() || null,
    staffId: form.staffId || null,
    leadId: form.leadId,
    clientId: form.clientId,
  };
}

async function save() {
  formError.value = null;
  if (!form.name.trim()) {
    formError.value = 'Хэнтэй уулзахыг бичнэ үү.';
    return;
  }
  if (formDayOff.value) {
    formError.value = 'Бямба, Ням гарагт оффис амардаг — ажлын өдөр сонгоно уу.';
    return;
  }
  if (!form.date || !form.time) {
    formError.value = 'Өдөр, цагаа сонгоно уу.';
    return;
  }

  saving.value = true;
  try {
    if (panel.value?.kind === 'edit') {
      await api.patch(`/consultation-appointments/${panel.value.item.id}`, { ...payload(), allDay: false });
    } else {
      await api.post('/consultation-appointments', payload());
    }
    // A booking made for another week should land where it can be seen;
    // changing the week reloads through the watcher.
    const target = mondayOf(ubInstant(form.date, 12 * 60));
    if (target === monday.value) await load();
    else monday.value = target;
    panel.value = null;
  } catch (error) {
    formError.value = apiErrorMessage(error, 'Хадгалж чадсангүй.');
  } finally {
    saving.value = false;
  }
}

async function setStatus(status: AppointmentStatus) {
  if (panel.value?.kind !== 'edit') return;
  saving.value = true;
  formError.value = null;
  try {
    await api.patch(`/consultation-appointments/${panel.value.item.id}`, { status });
    await load();
    panel.value = null;
  } catch (error) {
    formError.value = apiErrorMessage(error, 'Төлөвийг өөрчилж чадсангүй.');
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (panel.value?.kind !== 'edit') return;
  if (!confirmDelete.value) {
    confirmDelete.value = true;
    return;
  }
  saving.value = true;
  try {
    await api.delete(`/consultation-appointments/${panel.value.item.id}`);
    await load();
    panel.value = null;
  } catch (error) {
    formError.value = apiErrorMessage(error, 'Устгаж чадсангүй.');
  } finally {
    saving.value = false;
  }
}

// ─── who the booking is for ─────────────────────────────────────────────────

interface PersonHit {
  key: string;
  label: string;
  sub: string;
  leadId: string | null;
  clientId: string | null;
  name: string;
  phone: string;
}

const personQuery = ref('');
const personHits = ref<PersonHit[]>([]);
const searching = ref(false);
let searchTimer: ReturnType<typeof setTimeout> | undefined;

watch(personQuery, (value) => {
  clearTimeout(searchTimer);
  if (value.trim().length < 2) {
    personHits.value = [];
    return;
  }
  searchTimer = setTimeout(() => searchPeople(value.trim()), 300);
});
onBeforeUnmount(() => clearTimeout(searchTimer));

/**
 * Clients and enquiries both: most clients were registered at the desk without
 * ever being a lead (1B-26), so searching leads alone would miss them.
 */
async function searchPeople(q: string) {
  searching.value = true;
  try {
    const [clients, leads] = await Promise.all([
      api.get<PaginatedResult<ClientListItem>>('/clients', { query: { q, limit: 5 } }),
      api.get<PaginatedResult<LeadListItem>>('/leads', { query: { q, limit: 5 } }),
    ]);
    const shownClients = new Set(clients.items.map((client) => client.id));
    personHits.value = [
      ...clients.items.map((client) => ({
        key: `c-${client.id}`,
        label: `${client.lastName} ${client.firstName}`,
        sub: `${client.code} · ${client.phone}`,
        leadId: null,
        clientId: client.id,
        name: `${client.lastName} ${client.firstName}`,
        phone: client.phone,
      })),
      // A lead that became one of the clients above is the same person.
      ...leads.items
        .filter((lead) => !lead.client || !shownClients.has(lead.client.id))
        .map((lead) => ({
          key: `l-${lead.id}`,
          label: [lead.lastName, lead.firstName].filter((part) => part && part !== '—').join(' '),
          sub: `Зөвлөгөө хүсэлт · ${lead.phone}`,
          leadId: lead.id,
          clientId: lead.client?.id ?? null,
          name: [lead.lastName, lead.firstName].filter((part) => part && part !== '—').join(' '),
          phone: lead.phone,
        })),
    ];
  } catch {
    personHits.value = [];
  } finally {
    searching.value = false;
  }
}

function pickPerson(hit: PersonHit) {
  form.leadId = hit.leadId;
  form.clientId = hit.clientId;
  form.name = hit.name;
  form.phone = hit.phone;
  form.linkLabel = hit.clientId ? hit.sub.split(' · ')[0]! : 'Зөвлөгөө хүсэлт';
  personQuery.value = '';
  personHits.value = [];
}

function unlink() {
  form.leadId = null;
  form.clientId = null;
  form.linkLabel = null;
}

const linkedPath = computed(() => {
  if (form.clientId) return `/admin/clients/${form.clientId}`;
  if (form.leadId) return `/admin/consultations/${form.leadId}`;
  return null;
});

// ─── start ──────────────────────────────────────────────────────────────────

onMounted(async () => {
  await Promise.all([
    load(),
    api.get<StaffMember[]>('/users/staff').then((people) => { staff.value = people; }).catch(() => {}),
  ]);

  // "Цаг товлох" on a lead card lands here with the person already chosen.
  const leadId = typeof route.query.leadId === 'string' ? route.query.leadId : null;
  if (leadId) {
    try {
      const lead = await api.get<LeadDetail>(`/leads/${leadId}`);
      openNew();
      pickPerson({
        key: lead.id,
        label: '',
        sub: lead.client ? `${lead.client.code} · ${lead.phone}` : '',
        leadId: lead.id,
        clientId: lead.client?.id ?? null,
        name: [lead.lastName, lead.firstName].filter((part) => part && part !== '—').join(' '),
        phone: lead.phone,
      });
    } catch {
      // A stale link just opens the calendar.
    }
  }
});

function dayTitle(day: CalendarDay) {
  return `${weekdayNameMn(day.weekday)}, ${monthNameMn(day.month)} ${day.day}`;
}
</script>

<template>
  <div class="gks-page">
    <header class="gks-page__head">
      <div class="gks-page__heading">
        <span class="gks-eyebrow">CRM</span>
        <h1 class="gks-page__title">Зөвлөгөөний цаг</h1>
        <p class="gks-result-count gks-tnum">
          {{ weekCount }} уулзалт энэ 7 хоногт · Даваа–Баасан ажиллана, Бямба, Ням амарна
        </p>
      </div>
      <div class="gks-page__actions">
        <DsButton variant="accent" icon-left="calendar-plus" @click="openNew()">Цаг нэмэх</DsButton>
      </div>
    </header>

    <DsCard>
      <div class="cal-toolbar">
        <div class="cal-toolbar__nav">
          <DsIconButton icon="chevron-left" label="Өмнөх 7 хоног" @click="shiftWeek(-1)" />
          <DsButton size="sm" variant="secondary" @click="thisWeek">Энэ 7 хоног</DsButton>
          <DsIconButton icon="chevron-right" label="Дараах 7 хоног" @click="shiftWeek(1)" />
          <span class="cal-toolbar__label gks-tnum">{{ weekLabel }}</span>
        </div>
        <div class="cal-toolbar__filters">
          <DsSelect v-model="staffFilter" :options="filterOptions" aria-label="Зөвлөх" />
          <DsTag :selected="showCancelled" clickable @click="showCancelled = !showCancelled">Цуцалсныг харуулах</DsTag>
        </div>
      </div>
      <ul class="cal-legend">
        <li><span class="cal-legend__swatch cal-block" /> Ажилтан нэмсэн</li>
        <li><span class="cal-legend__swatch cal-block cal-block--ai" /> AI чатаар тохирсон</li>
        <li><span class="cal-legend__swatch cal-block cal-block--visit" /> Материал авчрах уулзалт</li>
        <li><span class="cal-legend__swatch cal-block cal-block--done" /> Ирсэн</li>
      </ul>
    </DsCard>

    <DsCard v-if="loadError" accent>
      <p>Календарийг ачаалж чадсангүй. <DsButton size="sm" variant="secondary" @click="load">Дахин оролдох</DsButton></p>
    </DsCard>

    <div class="cal-layout" :class="{ 'cal-layout--panel': panel }">
      <div class="cal-scroll" :aria-busy="pending">
        <div class="cal-grid" :style="{ '--slot-h': `${SLOT_HEIGHT}px` }">
          <!-- Day headings -->
          <div class="cal-corner" />
          <div
            v-for="day in days"
            :key="`h-${day.key}`"
            class="cal-head"
            :class="{ 'cal-head--today': day.key === todayKey, 'cal-head--off': !day.hours }"
          >
            <span class="cal-head__weekday">{{ weekdayNameMn(day.weekday) }}</span>
            <span class="cal-head__date gks-tnum">{{ day.day }}</span>
            <span v-if="!day.hours" class="cal-head__off">Амралт</span>
          </div>

          <!-- Day-only bookings -->
          <template v-if="hasAllDay">
            <div class="cal-allday-label">Өдөржин</div>
            <div v-for="day in days" :key="`a-${day.key}`" class="cal-allday" :class="{ 'cal-allday--off': !day.hours }">
              <button
                v-for="item in allDayByDay[day.key]"
                :key="item.id"
                type="button"
                class="cal-chip"
                :class="{ 'cal-chip--cancelled': item.status === 'CANCELLED' }"
                :title="`${item.name} — цаг тохироогүй, ажлын цагаар ирнэ`"
                @click="openEdit(item)"
              >
                <DsIcon :name="MODE_ICON[item.mode]" :size="12" />
                {{ item.name }}
              </button>
            </div>
          </template>

          <!-- Time axis -->
          <div class="cal-times">
            <div v-for="minute in rows" :key="minute" class="cal-time gks-tnum">
              <span v-if="minute % 60 === 0">{{ minutesLabel(minute) }}</span>
            </div>
          </div>

          <!-- Day columns -->
          <div
            v-for="day in days"
            :key="`d-${day.key}`"
            class="cal-day"
            :class="{ 'cal-day--off': !day.hours, 'cal-day--today': day.key === todayKey }"
            :aria-label="dayTitle(day)"
          >
            <template v-for="minute in rows" :key="minute">
              <button
                v-if="isOpenSlot(day, minute)"
                type="button"
                class="cal-slot"
                :class="{ 'cal-slot--hour': minute % 60 === 0 }"
                :aria-label="`${dayTitle(day)} ${minutesLabel(minute)}-д цаг нэмэх`"
                @click="openNew(day, minute)"
              />
              <div v-else class="cal-slot cal-slot--closed" :class="{ 'cal-slot--hour': minute % 60 === 0 }" />
            </template>

            <div
              v-if="day.key === todayKey && nowInGrid"
              class="cal-now"
              :style="{ top: `${nowLineTop}px` }"
              aria-hidden="true"
            />

            <button
              v-for="placed in blocksByDay[day.key]"
              :key="placed.block.id"
              type="button"
              class="cal-block"
              :class="blockClass(placed.block)"
              :style="blockStyle(placed)"
              :title="`${minutesLabel(placed.block.start)} ${placed.block.item.name ?? ''}`"
              @click="onBlock(placed.block)"
            >
              <template v-if="placed.block.kind === 'consultation'">
                <span class="cal-block__time gks-tnum">
                  <DsIcon :name="MODE_ICON[placed.block.item.mode]" :size="12" />
                  {{ minutesLabel(placed.block.start) }}
                  <DsIcon v-if="!placed.block.item.createdBy" name="sparkles" :size="12" />
                </span>
                <span class="cal-block__name">{{ placed.block.item.name }}</span>
                <span v-if="placed.block.item.staff" class="cal-block__staff">
                  {{ placed.block.item.staff.name ?? placed.block.item.staff.email }}
                </span>
              </template>
              <template v-else>
                <span class="cal-block__time gks-tnum">
                  <DsIcon name="folder-check" :size="12" /> {{ minutesLabel(placed.block.start) }}
                </span>
                <span class="cal-block__name">{{ placed.block.item.name ?? placed.block.item.caseCode }}</span>
              </template>
            </button>
          </div>
        </div>
      </div>

      <!-- Side panel -->
      <aside v-if="panel" class="cal-panel">
        <DsCard v-if="panel.kind === 'visit'">
          <div class="cal-panel__head">
            <h2 class="cal-panel__title">Материал авчрах уулзалт</h2>
            <DsIconButton icon="x" label="Хаах" @click="panel = null" />
          </div>
          <dl class="cal-facts">
            <dt>Хэн</dt><dd>{{ panel.item.name ?? '—' }}</dd>
            <dt>Утас</dt><dd class="gks-tnum">{{ panel.item.phone ?? '—' }}</dd>
            <dt>Хэзээ</dt><dd class="gks-tnum">{{ formatDayMonthTime(panel.item.scheduledAt) }}</dd>
            <dt>Төлөв</dt><dd><DsBadge :tone="APPOINTMENT_STATUS_TONE[panel.item.status]">{{ APPOINTMENT_STATUS_LABELS[panel.item.status] }}</DsBadge></dd>
            <template v-if="panel.item.note"><dt>Тэмдэглэл</dt><dd>{{ panel.item.note }}</dd></template>
          </dl>
          <p class="gks-muted cal-panel__hint">
            Үйлчлүүлэгч эх хувийг өгөхөөр кабинетаасаа товлосон. Шилжүүлэх, хаах нь хэргийн материалын хэсэгт.
          </p>
          <DsButton variant="secondary" icon-right="arrow-right" @click="navigateTo(`/admin/cases/${panel.item.caseId}`)">
            {{ panel.item.caseCode }} хэрэг рүү
          </DsButton>
        </DsCard>

        <DsCard v-else>
          <form class="cal-form" @submit.prevent="save">
            <div class="cal-panel__head">
              <h2 class="cal-panel__title">{{ panel.kind === 'edit' ? 'Товлосон цаг' : 'Цаг нэмэх' }}</h2>
              <DsIconButton icon="x" label="Хаах" @click="panel = null" />
            </div>

            <div v-if="panel.kind === 'edit'" class="cal-form__badges">
              <DsBadge :tone="APPOINTMENT_STATUS_TONE[panel.item.status]">{{ APPOINTMENT_STATUS_LABELS[panel.item.status] }}</DsBadge>
              <DsBadge v-if="!panel.item.createdBy" tone="info" icon="sparkles">AI чатаар тохирсон</DsBadge>
              <DsBadge v-else tone="neutral">{{ panel.item.createdBy.name ?? 'Ажилтан' }} нэмсэн</DsBadge>
            </div>
            <p v-if="panel.kind === 'edit' && panel.item.allDay" class="cal-form__notice">
              <DsIcon name="info" :size="14" /> Чатаар зөвхөн өдөр нь тохирсон — цагийг нь сонгоод хадгалбал календарьт байрлана.
            </p>

            <!-- Who -->
            <div v-if="form.linkLabel" class="cal-link">
              <DsIcon name="link" :size="14" />
              <NuxtLink v-if="linkedPath" :to="linkedPath">{{ form.linkLabel }}</NuxtLink>
              <button type="button" class="cal-link__clear" @click="unlink">Салгах</button>
            </div>
            <div v-else class="cal-search">
              <DsInput
                v-model="personQuery"
                type="search"
                icon-left="search"
                label="Бүртгэлээс хайх"
                placeholder="Нэр эсвэл утас…"
                hint="Олдохгүй бол доор нэр, утсыг шууд бичнэ."
              />
              <ul v-if="personHits.length" class="cal-search__hits">
                <li v-for="hit in personHits" :key="hit.key">
                  <button type="button" @click="pickPerson(hit)">
                    <span>{{ hit.label }}</span>
                    <span class="gks-muted">{{ hit.sub }}</span>
                  </button>
                </li>
              </ul>
              <p v-else-if="searching" class="gks-muted cal-search__state">Хайж байна…</p>
            </div>

            <DsInput v-model="form.name" label="Нэр" required />
            <DsInput v-model="form.phone" label="Утас" inputmode="tel" />

            <!-- When -->
            <div class="cal-form__row">
              <DsInput v-model="form.date" type="date" label="Өдөр" required />
              <DsSelect
                v-model="form.time"
                label="Цаг"
                :options="[{ value: '', label: '—' }, ...timeOptions]"
                :disabled="formDayOff"
              />
            </div>
            <p v-if="formDayOff" class="cal-form__error">Бямба, Ням гарагт оффис амардаг.</p>
            <div class="cal-form__row">
              <DsSelect v-model="form.duration" label="Үргэлжлэх" :options="DURATION_OPTIONS" />
              <DsSelect v-model="form.mode" label="Хэлбэр" :options="MODE_OPTIONS" />
            </div>
            <DsSelect v-model="form.staffId" label="Уулзах зөвлөх" :options="staffOptions" />
            <DsTextarea v-model="form.note" label="Тэмдэглэл" :rows="3" />

            <p v-if="formError" class="cal-form__error">{{ formError }}</p>

            <div class="cal-form__actions">
              <DsButton type="submit" variant="accent" :loading="saving">
                {{ panel.kind === 'edit' ? 'Хадгалах' : 'Цаг нэмэх' }}
              </DsButton>
              <DsButton variant="secondary" @click="panel = null">Болих</DsButton>
            </div>

            <template v-if="panel.kind === 'edit'">
              <div class="cal-form__outcome">
                <span class="gks-muted">Үр дүн:</span>
                <DsButton size="sm" variant="secondary" icon-left="check" :disabled="saving" @click="setStatus('COMPLETED')">Ирсэн</DsButton>
                <DsButton size="sm" variant="secondary" icon-left="user-x" :disabled="saving" @click="setStatus('NO_SHOW')">Ирээгүй</DsButton>
                <DsButton
                  v-if="panel.item.status !== 'CANCELLED'"
                  size="sm"
                  variant="secondary"
                  icon-left="calendar-x"
                  :disabled="saving"
                  @click="setStatus('CANCELLED')"
                >
                  Цуцлах
                </DsButton>
                <DsButton
                  v-if="panel.item.status !== 'SCHEDULED'"
                  size="sm"
                  variant="ghost"
                  icon-left="rotate-ccw"
                  :disabled="saving"
                  @click="setStatus('SCHEDULED')"
                >
                  Дахин товлосон болгох
                </DsButton>
              </div>
              <DsButton size="sm" :variant="confirmDelete ? 'danger' : 'ghost'" icon-left="trash-2" :disabled="saving" @click="remove">
                {{ confirmDelete ? 'Үнэхээр устгах уу? Дахин дарна уу' : 'Устгах' }}
              </DsButton>
            </template>
          </form>
        </DsCard>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.cal-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--sp-3); }
.cal-toolbar__nav { display: flex; align-items: center; gap: var(--sp-2); }
.cal-toolbar__label { margin-left: var(--sp-2); font-weight: var(--fw-semibold); color: var(--text-strong); }
.cal-toolbar__filters { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }

.cal-legend { display: flex; flex-wrap: wrap; gap: var(--sp-4); margin: var(--sp-3) 0 0; padding: 0; list-style: none; font-size: var(--fs-caption); color: var(--text-muted); }
.cal-legend li { display: flex; align-items: center; gap: var(--sp-2); }
.cal-legend .cal-legend__swatch { position: static; display: inline-block; width: 18px; height: 12px; padding: 0; border-radius: 2px; box-shadow: none; }

.cal-layout { display: grid; gap: var(--sp-4); align-items: start; }
.cal-layout--panel { grid-template-columns: minmax(0, 1fr) 360px; }
@media (max-width: 1100px) {
  .cal-layout--panel { grid-template-columns: minmax(0, 1fr); }
  .cal-panel { order: -1; }
}

/* The grid scrolls inside itself on a phone; the page never does. */
.cal-scroll {
  overflow-x: auto;
  background: var(--surface-card);
  border: 1px solid var(--line-hairline);
  border-radius: var(--radius-3);
}
.cal-scroll[aria-busy='true'] { opacity: .6; }

.cal-grid {
  display: grid;
  grid-template-columns: 56px repeat(5, minmax(120px, 1fr)) repeat(2, minmax(64px, .45fr));
  min-width: 820px;
}

.cal-corner, .cal-head, .cal-allday-label, .cal-allday { border-bottom: 1px solid var(--line-hairline); }
.cal-head {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: var(--sp-2) var(--sp-1);
  border-left: 1px solid var(--line-soft);
  background: var(--surface-card);
}
.cal-head__weekday { font-size: var(--fs-caption); color: var(--text-muted); }
.cal-head__date { font-size: var(--fs-h4); font-weight: var(--fw-semibold); color: var(--text-strong); line-height: 1.1; }
.cal-head--today .cal-head__date {
  color: var(--text-inverse); background: var(--surface-accent);
  border-radius: var(--radius-pill); min-width: 2em; text-align: center;
}
.cal-head--off { background: var(--surface-sunken); }
.cal-head--off .cal-head__date { color: var(--text-subtle); }
.cal-head__off { font-size: var(--fs-micro); color: var(--text-subtle); text-transform: uppercase; letter-spacing: .04em; }

.cal-allday-label { font-size: var(--fs-micro); color: var(--text-subtle); padding: var(--sp-2) var(--sp-1); text-align: right; }
.cal-allday {
  display: flex; flex-direction: column; gap: 2px; padding: var(--sp-1);
  border-left: 1px solid var(--line-soft); min-height: 30px;
}
.cal-allday--off { background: var(--surface-sunken); }
.cal-chip {
  display: flex; align-items: center; gap: 4px;
  padding: 2px 6px; border: 1px dashed var(--brand-300); border-radius: var(--radius-1);
  background: var(--surface-brand-soft); color: var(--brand-800);
  font: inherit; font-size: var(--fs-micro); text-align: left; cursor: pointer;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cal-chip--cancelled { opacity: .55; text-decoration: line-through; }

.cal-times { display: flex; flex-direction: column; }
.cal-time {
  height: var(--slot-h); font-size: var(--fs-micro); color: var(--text-subtle);
  text-align: right; padding-right: var(--sp-2); transform: translateY(-.6em);
}

.cal-day { position: relative; display: flex; flex-direction: column; border-left: 1px solid var(--line-soft); }
.cal-day--today { background: var(--brand-025); }
.cal-day--off {
  background: repeating-linear-gradient(135deg, var(--surface-sunken) 0 8px, var(--n-050) 8px 16px);
}
.cal-slot {
  height: var(--slot-h); border: 0; border-top: 1px dashed var(--line-soft);
  background: transparent; padding: 0; display: block; width: 100%;
}
.cal-slot--hour { border-top-style: solid; border-top-color: var(--line-hairline); }
button.cal-slot { cursor: pointer; }
button.cal-slot:hover, button.cal-slot:focus-visible { background: var(--surface-selected); outline: none; }
.cal-slot--closed { background: transparent; }

.cal-now { position: absolute; left: 0; right: 0; height: 2px; background: var(--red-600); z-index: 3; pointer-events: none; }
.cal-now::before { content: ''; position: absolute; left: -4px; top: -3px; width: 8px; height: 8px; border-radius: 50%; background: var(--red-600); }

.cal-block {
  position: absolute; z-index: 2;
  display: flex; flex-direction: column; align-items: flex-start; gap: 1px;
  padding: 3px 6px; overflow: hidden;
  border: 0; border-left: 3px solid var(--brand-600); border-radius: var(--radius-1);
  background: var(--brand-100); color: var(--brand-950);
  font: inherit; font-size: var(--fs-micro); line-height: 1.25; text-align: left; cursor: pointer;
  box-shadow: var(--shadow-hairline);
}
.cal-block:hover, .cal-block:focus-visible { box-shadow: var(--shadow-lift); z-index: 4; outline: none; }
.cal-block__time { display: flex; align-items: center; gap: 3px; font-weight: var(--fw-semibold); }
.cal-block__name { font-weight: var(--fw-medium); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.cal-block__staff { color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.cal-block--short { flex-direction: row; align-items: center; gap: 6px; }
.cal-block--short .cal-block__staff { display: none; }
.cal-block--ai { background: var(--surface-brand-soft); border-left-style: dashed; }
.cal-block--visit { background: var(--warning-bg); border-left-color: var(--amber-600); color: var(--amber-700); }
.cal-block--done { background: var(--success-bg); border-left-color: var(--green-600); color: var(--green-700); }
.cal-block--missed { background: var(--danger-bg); border-left-color: var(--red-600); color: var(--danger-fg); }
.cal-block--cancelled { background: var(--surface-sunken); border-left-color: var(--n-400); color: var(--text-subtle); text-decoration: line-through; }

.cal-panel { position: sticky; top: var(--sp-4); }
.cal-panel__head { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); }
.cal-panel__title { font-size: var(--fs-h4); margin: 0; }
.cal-panel__hint { font-size: var(--fs-body-sm); margin: var(--sp-3) 0; }

.cal-form { display: flex; flex-direction: column; gap: var(--sp-3); }
.cal-form__badges { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
.cal-form__notice { display: flex; gap: var(--sp-2); font-size: var(--fs-body-sm); color: var(--info-fg); background: var(--info-bg); padding: var(--sp-2) var(--sp-3); border-radius: var(--radius-2); margin: 0; }
.cal-form__row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-3); }
.cal-form__error { color: var(--danger-fg); font-size: var(--fs-body-sm); margin: 0; }
.cal-form__actions { display: flex; gap: var(--sp-2); }
.cal-form__outcome { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); padding-top: var(--sp-3); border-top: 1px solid var(--line-soft); }

.cal-link { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-body-sm); padding: var(--sp-2) var(--sp-3); background: var(--surface-sunken); border-radius: var(--radius-2); }
.cal-link__clear { margin-left: auto; border: 0; background: none; color: var(--text-muted); font: inherit; cursor: pointer; text-decoration: underline; }

.cal-search { position: relative; }
.cal-search__hits {
  list-style: none; margin: var(--sp-1) 0 0; padding: var(--sp-1);
  border: 1px solid var(--line-hairline); border-radius: var(--radius-2); background: var(--surface-raised); box-shadow: var(--shadow-menu);
}
.cal-search__hits button {
  display: flex; flex-direction: column; align-items: flex-start; width: 100%;
  padding: var(--sp-2); border: 0; border-radius: var(--radius-1); background: none; font: inherit; text-align: left; cursor: pointer;
}
.cal-search__hits button:hover { background: var(--surface-hover); }
.cal-search__hits .gks-muted { font-size: var(--fs-caption); }
.cal-search__state { font-size: var(--fs-caption); margin: var(--sp-1) 0 0; }

.cal-facts { display: grid; grid-template-columns: auto 1fr; gap: var(--sp-2) var(--sp-4); margin: var(--sp-3) 0; }
.cal-facts dt { color: var(--text-muted); }
.cal-facts dd { margin: 0; }

@media (max-width: 640px) {
  .cal-form__row { grid-template-columns: 1fr; }
}
</style>
