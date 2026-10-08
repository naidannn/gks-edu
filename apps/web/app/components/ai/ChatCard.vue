<script setup lang="ts">
import type { AiChatCard } from '@gks/shared';

/**
 * One tool result, drawn (2C-03).
 *
 * The figures here came from the database, not from the model — a price, a
 * deadline, a rank travel from the row to the screen untouched, which is why a
 * card is trusted where the prose beside it is only explained (AI-ASSISTANT.md
 * §5.4). So the card states, and it links: every school, programme and round
 * is one tap from the page that holds the rest of it, or from the screen that
 * acts on it. Continuing the *conversation* is the chips' job
 * (`AiChatNextSteps`), so nothing here sends a message.
 *
 * Only our deadline exists on an intake card — the school's is not in the
 * payload at all (CLAUDE.md).
 */
const props = defineProps<{ card: AiChatCard }>();

/** A list card shows this many rows; the rest is one link away. */
const ROWS = 5;

const intakes = computed(() => (props.card.type === 'intakes' ? props.card.data.items.slice(0, ROWS) : []));

function initials(name: string): string {
  return name.replace(/[^\p{L}\s]/gu, '').trim().slice(0, 1).toUpperCase();
}

function intakeTerm(year: number, month: number): string {
  return `${year} · ${INTAKE_MONTH_LABELS[month] ?? `${month}-р сар`}`;
}
</script>

<template>
  <!-- One school -->
  <article v-if="card.type === 'university'" class="ai-card">
    <div class="ai-card__school">
      <img v-if="card.data.logoPath" :src="card.data.logoPath" alt="" class="ai-card__logo" loading="lazy">
      <span v-else class="ai-card__logo ai-card__logo--blank">{{ initials(card.data.nameMn) }}</span>
      <div class="ai-card__school-text">
        <strong>{{ card.data.nameMn }}</strong>
        <span>{{ [card.data.nameKo, card.data.cityMn].filter(Boolean).join(' · ') }}</span>
      </div>
    </div>
    <div class="ai-card__tags">
      <DsBadge v-if="card.data.theKoreaRank" tone="info" icon="trophy">THE #{{ card.data.theKoreaRank }}</DsBadge>
      <DsBadge v-if="card.data.isGksEligible" tone="success" icon="award">GKS</DsBadge>
      <DsBadge v-if="card.data.acceptsLanguagePrep" tone="neutral" icon="languages">Хэлний бэлтгэл</DsBadge>
      <DsBadge v-if="card.data.accreditation === 'EXCELLENT'" tone="accent" icon="shield-check">Виз хялбаршуулсан</DsBadge>
    </div>
    <footer class="ai-card__foot">
      <NuxtLink :to="card.data.url" class="ai-card__link">
        Танилцуулга үзэх <DsIcon name="arrow-right" :size="14" />
      </NuxtLink>
      <NuxtLink :to="consultationLink({ university: card.data.slug })" class="ai-card__link ai-card__link--quiet">
        Зөвлөгөө авах
      </NuxtLink>
    </footer>
  </article>

  <!-- Several schools -->
  <article v-else-if="card.type === 'universities'" class="ai-card ai-card--list">
    <header class="ai-card__head">
      <DsIcon name="building-2" :size="15" />
      <span>Сургууль · {{ card.data.total }} олдлоо</span>
    </header>
    <NuxtLink
      v-for="school in card.data.items.slice(0, ROWS)"
      :key="school.slug"
      :to="`/universities/${school.slug}`"
      class="ai-card__row"
    >
      <img v-if="school.logoPath" :src="school.logoPath" alt="" class="ai-card__logo ai-card__logo--sm" loading="lazy">
      <span v-else class="ai-card__logo ai-card__logo--sm ai-card__logo--blank">{{ initials(school.nameMn) }}</span>
      <span class="ai-card__row-main">
        <strong>{{ school.nameMn }}</strong>
        <span>
          {{ school.cityMn ?? school.nameEn }}<template v-if="school.theKoreaRank"> · THE #{{ school.theKoreaRank }}</template><template v-if="school.isGksEligible"> · GKS</template>
        </span>
      </span>
      <DsIcon name="chevron-right" :size="16" class="ai-card__chev" />
    </NuxtLink>
    <footer v-if="card.data.total > ROWS || card.data.searchUrl" class="ai-card__foot">
      <NuxtLink :to="card.data.searchUrl" class="ai-card__link">
        Бүгдийг каталогоос харах <DsIcon name="arrow-right" :size="14" />
      </NuxtLink>
    </footer>
  </article>

  <!-- Programmes with their tuition -->
  <article v-else-if="card.type === 'programs'" class="ai-card ai-card--list">
    <header class="ai-card__head">
      <DsIcon name="graduation-cap" :size="15" />
      <span>Хөтөлбөр · {{ card.data.total }} олдлоо</span>
    </header>
    <NuxtLink
      v-for="program in card.data.items.slice(0, ROWS)"
      :key="program.id"
      :to="`/universities/${program.university.slug}`"
      class="ai-card__row"
    >
      <span class="ai-card__row-main">
        <strong>{{ program.nameMn }}</strong>
        <span>{{ program.university.nameMn }} · {{ PROGRAM_LEVEL_LABELS[program.level] }}</span>
      </span>
      <span class="ai-card__price">
        <template v-if="program.tuitionPerYearKrw">
          <strong>{{ formatKrw(program.tuitionPerYearKrw) }}</strong>
          <span>жилд · {{ tuitionTermsNote(program.level) }}</span>
        </template>
        <span v-else class="ai-card__unknown">{{ UNKNOWN_LABEL }}</span>
      </span>
    </NuxtLink>
    <footer class="ai-card__foot">
      <NuxtLink :to="card.data.searchUrl" class="ai-card__link">
        Бүх хөтөлбөрийг харах <DsIcon name="arrow-right" :size="14" />
      </NuxtLink>
    </footer>
  </article>

  <!-- Rounds still open to us, on our deadline -->
  <article v-else-if="card.type === 'intakes'" class="ai-card ai-card--list">
    <header class="ai-card__head">
      <DsIcon name="calendar-clock" :size="15" />
      <span>Элсэлт · манай бүртгэлийн эцсийн хугацаа</span>
    </header>
    <div v-for="intake in intakes" :key="intake.id" class="ai-card__row">
      <span class="ai-card__row-main">
        <strong>{{ intake.university.nameMn }}</strong>
        <span>{{ PROGRAM_LEVEL_LABELS[intake.level] }} · {{ intakeTerm(intake.year, intake.month) }}</span>
        <span v-if="intake.internalDeadline">
          Бүртгэл {{ formatNumericDateUtc(intake.internalDeadline) }} хүртэл
        </span>
      </span>
      <span class="ai-card__intake-side">
        <DsBadge :tone="deadlineCountdownTone(intake.daysUntilInternalDeadline)">
          {{ deadlineCountdownLabel(intake.daysUntilInternalDeadline) }}
        </DsBadge>
        <NuxtLink
          v-if="(intake.daysUntilInternalDeadline ?? 0) >= 0"
          :to="startCaseLink({ university: intake.university.slug, intakeId: intake.id })"
          class="ai-card__link"
        >
          Бүртгүүлэх <DsIcon name="arrow-right" :size="14" />
        </NuxtLink>
      </span>
    </div>
    <footer class="ai-card__foot">
      <NuxtLink to="/admissions" class="ai-card__link ai-card__link--quiet">
        Бүх элсэлтийн хуанли <DsIcon name="arrow-right" :size="14" />
      </NuxtLink>
    </footer>
  </article>

  <!-- A service's current price -->
  <article v-else-if="card.type === 'pricing'" class="ai-card">
    <header class="ai-card__head">
      <DsIcon name="receipt" :size="15" />
      <span>{{ SERVICE_LABELS[card.data.serviceType] }} — үйлчилгээний үнэ</span>
    </header>
    <p class="ai-card__total">{{ formatMnt(card.data.totalAmount) }}</p>
    <dl class="ai-card__terms">
      <div>
        <dt>Урьдчилгаа</dt>
        <dd>{{ formatMnt(card.data.prepaymentAmount) }} <span>· гэрээ байгуулахад</span></dd>
      </div>
      <div>
        <dt>Үлдэгдэл</dt>
        <dd>{{ formatMnt(card.data.balanceAmount) }} <span>· {{ BALANCE_TRIGGER_LABELS[card.data.balanceTrigger] }}</span></dd>
      </div>
    </dl>
    <footer class="ai-card__foot">
      <NuxtLink :to="startCaseLink({ service: card.data.serviceType })" class="ai-card__cta">
        Гэрээ байгуулах <DsIcon name="arrow-right" :size="14" />
      </NuxtLink>
      <NuxtLink :to="consultationLink({ service: card.data.serviceType })" class="ai-card__link ai-card__link--quiet">
        Зөвлөгөө авах
      </NuxtLink>
    </footer>
  </article>

  <!-- Exchange rate: one line, it is a fact rather than a choice -->
  <p v-else-if="card.type === 'fx'" class="ai-card ai-card--line">
    <DsIcon name="banknote" :size="15" />
    <span>
      ₩1 = <strong>{{ card.data.rate.toFixed(2) }}₮</strong>
      · {{ formatNumericDateUtc(card.data.date) }} · {{ card.data.source }}
    </span>
  </p>
</template>

<style scoped>
.ai-card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  width: 100%;
  max-width: 560px;
  padding: var(--sp-4);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-3);
  background: var(--surface-card);
  box-shadow: 0 1px 2px rgba(15, 31, 74, .04);
}
.ai-card--list { gap: 0; padding: 0; overflow: hidden; }

.ai-card__head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-caption);
  font-weight: var(--fw-semibold);
  color: var(--text-muted);
}
.ai-card--list .ai-card__head {
  padding: var(--sp-3) var(--sp-4);
  border-bottom: var(--border-hair) solid var(--line-soft);
  background: var(--surface-sunken);
}

.ai-card__school { display: flex; align-items: center; gap: var(--sp-3); }
.ai-card__school-text { display: flex; flex-direction: column; min-width: 0; }
.ai-card__school-text strong { font-size: var(--fs-body); color: var(--text-strong); }
.ai-card__school-text span { font-size: var(--fs-caption); color: var(--text-muted); }

.ai-card__logo {
  flex: none;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-2);
  border: var(--border-hair) solid var(--line-soft);
  background: var(--surface-card);
  object-fit: contain;
  padding: 4px;
}
.ai-card__logo--sm { width: 34px; height: 34px; padding: 3px; border-radius: var(--radius-1); }
.ai-card__logo--blank {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--brand-050);
  color: var(--brand-700);
  font-weight: var(--fw-bold);
}

.ai-card__tags { display: flex; flex-wrap: wrap; gap: 6px; }

.ai-card__row {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-4);
  border-bottom: var(--border-hair) solid var(--line-soft);
  color: inherit;
  text-decoration: none;
  transition: background .15s ease;
}
a.ai-card__row:hover { background: var(--surface-hover); }
.ai-card__row-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.ai-card__row-main strong {
  font-size: var(--fs-body-sm);
  color: var(--text-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ai-card__row-main span { font-size: var(--fs-caption); color: var(--text-muted); }
.ai-card__chev { flex: none; color: var(--text-subtle); }

.ai-card__price { display: flex; flex-direction: column; align-items: flex-end; flex: none; text-align: right; }
.ai-card__price strong { font-size: var(--fs-body-sm); color: var(--text-strong); white-space: nowrap; }
.ai-card__price span { font-size: var(--fs-micro); color: var(--text-subtle); white-space: nowrap; }
.ai-card__unknown { max-width: 110px; white-space: normal !important; }

.ai-card__intake-side { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex: none; }

.ai-card__total {
  font-family: var(--font-display);
  font-size: var(--fs-h3);
  font-weight: var(--fw-bold);
  color: var(--text-strong);
}
.ai-card__terms { display: flex; flex-direction: column; gap: var(--sp-2); }
.ai-card__terms div { display: flex; justify-content: space-between; gap: var(--sp-3); font-size: var(--fs-body-sm); }
.ai-card__terms dt { color: var(--text-muted); }
.ai-card__terms dd { color: var(--text-strong); font-weight: var(--fw-semibold); text-align: right; }
.ai-card__terms dd span { font-weight: var(--fw-regular); color: var(--text-muted); }

.ai-card__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2) var(--sp-4);
}
.ai-card--list .ai-card__foot { padding: var(--sp-3) var(--sp-4); }

.ai-card__link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--fs-label);
  font-weight: var(--fw-semibold);
  color: var(--brand-600);
  text-decoration: none;
}
.ai-card__link:hover { color: var(--brand-700); text-decoration: underline; }
.ai-card__link--quiet { color: var(--text-muted); }

.ai-card__cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: var(--radius-pill);
  background: var(--brand-600);
  color: var(--text-inverse);
  font-size: var(--fs-label);
  font-weight: var(--fw-semibold);
  text-decoration: none;
}
.ai-card__cta:hover { background: var(--brand-700); }

.ai-card--line {
  flex-direction: row;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-3);
  font-size: var(--fs-caption);
  color: var(--text-muted);
}
.ai-card--line strong { color: var(--text-strong); }
</style>
