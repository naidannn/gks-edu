<script setup lang="ts">
import type { AgentContractStatus, UniversityType } from '@gks/shared';
import type { UniversityForm } from '~/utils/university-form';

/**
 * Every editable field of a university record, grouped the way the catalogue
 * page reads them. Shared by the create and edit screens (1A-25/1A-26).
 *
 * An empty numeric box means "unknown", not zero — the hints say so, because
 * the dataset genuinely leaves dormitory prices and student counts unfilled.
 */
/** Two-way bound: the parent owns the object, this component writes its fields. */
const form = defineModel<UniversityForm>({ required: true });

defineProps<{
  errors: Record<string, string>;
  /** Slug is the public URL; changing it on a live school breaks saved links. */
  slugLocked?: boolean;
}>();

const TYPE_OPTIONS = (Object.entries(UNIVERSITY_TYPE_LABELS) as [UniversityType, string][])
  .map(([value, label]) => ({ value, label }));
const AGENT_OPTIONS = (Object.entries(AGENT_CONTRACT_STATUS_LABELS) as [AgentContractStatus, string][])
  .map(([value, label]) => ({ value, label }));
const TRISTATE_OPTIONS = [
  { value: '', label: 'Тодорхойгүй' },
  { value: 'true', label: 'Тийм' },
  { value: 'false', label: 'Үгүй' },
];

function addAdvantage() {
  form.value.advantages.push('');
}
function removeAdvantage(index: number) {
  form.value.advantages.splice(index, 1);
}
</script>

<template>
  <div class="gks-uform">
    <DsCard title="Үндсэн мэдээлэл">
      <div class="gks-uform__grid">
        <DsInput
          v-model="form.slug"
          label="Slug (нийтийн хаяг)"
          required
          :disabled="slugLocked"
          :error="errors.slug"
          :hint="slugLocked ? 'Хаяг өөрчлөхөд хуучин холбоос ажиллахаа болино — түгжээг тайлж болно.' : 'жишээ: ajou-university'"
          placeholder="ajou-university"
        />
        <DsSelect v-model="form.type" label="Төрөл" :options="TYPE_OPTIONS" />
        <DsInput v-model="form.nameMn" label="Нэр (монгол)" required :error="errors.nameMn" />
        <DsInput v-model="form.nameEn" label="Нэр (англи)" required :error="errors.nameEn" />
        <DsInput v-model="form.nameKo" label="Нэр (солонгос)" required :error="errors.nameKo" />
        <DsInput
          v-model="form.foundedYear"
          label="Байгуулагдсан он"
          type="number"
          :error="errors.foundedYear"
          hint="Хоосон = мэдээлэл алга"
        />
      </div>
    </DsCard>

    <DsCard title="Байршил">
      <div class="gks-uform__grid">
        <DsInput v-model="form.cityMn" label="Хот (монгол)" required :error="errors.cityMn" />
        <DsInput v-model="form.cityEn" label="Хот (англи)" required :error="errors.cityEn" />
        <DsInput v-model="form.regionMn" label="Бүс (монгол)" required :error="errors.regionMn" />
        <DsInput
          v-model="form.regionEn"
          label="Бүс (англи)"
          required
          :error="errors.regionEn"
          hint="Каталогийн бүсийн шүүлтүүр энэ утгаар бүлэглэнэ"
        />
        <DsInput v-model="form.lat" label="Өргөрөг" type="number" step="0.000001" :error="errors.lat" />
        <DsInput v-model="form.lon" label="Уртраг" type="number" step="0.000001" :error="errors.lon" />
        <DsInput
          v-model="form.distanceFromSeoulKm"
          label="Сөүлээс (км)"
          type="number"
          step="0.1"
          :error="errors.distanceFromSeoulKm"
        />
        <DsInput v-model="form.travelTimeFromSeoul" label="Сөүлээс явах хугацаа" placeholder="Метроор 50 минут" />
        <DsInput
          v-model="form.nearestTransit"
          label="Ойрх метро / автобус"
          hint="Импортод бөглөгддөггүй — оффисоос гараар нөхнө"
        />
      </div>
      <DsInput v-model="form.address" label="Хаяг" class="gks-uform__wide" />
    </DsCard>

    <DsCard title="Үзүүлэлт">
      <div class="gks-uform__grid">
        <DsInput v-model="form.studentsTotal" label="Нийт оюутан" type="number" :error="errors.studentsTotal" />
        <DsInput
          v-model="form.internationalStudents"
          label="Гадаад оюутан"
          type="number"
          :error="errors.internationalStudents"
          hint="Импортод бөглөгддөггүй"
        />
        <DsInput
          v-model="form.mongolianStudents"
          label="Монгол оюутан"
          type="number"
          :error="errors.mongolianStudents"
        />
        <DsInput v-model="form.numCampuses" label="Кампусын тоо" type="number" :error="errors.numCampuses" />
      </div>
      <DsTextarea v-model="form.campusInfo" label="Кампусын тайлбар" :rows="3" />
    </DsCard>

    <DsCard title="Танилцуулга">
      <div class="gks-uform__grid">
        <DsInput v-model="form.logoPath" label="Логоны зам" placeholder="/universities/logos/ajou-university.png" />
        <DsInput v-model="form.coverPath" label="Cover зургийн зам" />
      </div>
      <DsTextarea
        v-model="form.shortIntroMn"
        label="Богино танилцуулга"
        :rows="2"
        hint="Каталогийн картанд харагдана — 1-2 өгүүлбэр"
      />
      <DsTextarea v-model="form.detailedIntroMn" label="Дэлгэрэнгүй танилцуулга" :rows="6" />

      <fieldset class="gks-uform__list">
        <legend class="gks-uform__legend">Давуу тал</legend>
        <p class="gks-uform__legend-hint">3–6 өгүүлбэр. Дэлгэрэнгүй хуудсанд жагсаалт болж харагдана.</p>
        <div v-for="(_, index) in form.advantages" :key="index" class="gks-uform__list-row">
          <DsInput v-model="form.advantages[index]" :aria-label="`Давуу тал ${index + 1}`" />
          <DsIconButton icon="trash-2" label="Мөр устгах" variant="outline" size="sm" @click="removeAdvantage(index)" />
        </div>
        <DsButton variant="secondary" size="sm" icon-left="plus" @click="addAdvantage">Давуу тал нэмэх</DsButton>
      </fieldset>
    </DsCard>

    <DsCard title="Дотуур байр">
      <p class="gks-uform__note">
        Импортод зориудаар бөглөгддөггүй хэсэг. Хоосон орхивол сайт дээр
        «{{ UNKNOWN_LABEL }}» гэж харагдана — 0 гэж бичиж болохгүй.
      </p>
      <div class="gks-uform__grid">
        <DsSelect v-model="form.dormAvailable" label="Дотуур байртай эсэх" :options="TRISTATE_OPTIONS" />
        <DsSelect v-model="form.dormMealIncluded" label="Хоол багтсан эсэх" :options="TRISTATE_OPTIONS" />
        <DsInput
          v-model="form.dormPricePerMonthKrw"
          label="Сарын төлбөр (₩)"
          type="number"
          :error="errors.dormPricePerMonthKrw"
        />
        <DsInput
          v-model="form.dormPricePerSemesterKrw"
          label="Улирлын төлбөр (₩)"
          type="number"
          :error="errors.dormPricePerSemesterKrw"
        />
        <DsInput v-model="form.dormDepositKrw" label="Барьцаа (₩)" type="number" :error="errors.dormDepositKrw" />
        <DsInput v-model="form.dormRoomTypes" label="Өрөөний төрөл" hint="Таслалаар тусгаарлана: 2 хүний, 4 хүний" />
      </div>
      <DsTextarea v-model="form.dormNote" label="Тэмдэглэл" :rows="2" />
    </DsCard>

    <DsCard title="Холбоос">
      <div class="gks-uform__grid">
        <DsInput v-model="form.officialWebsite" label="Албан ёсны вебсайт" placeholder="https://…" />
        <DsInput v-model="form.wikipedia" label="Wikipedia" placeholder="https://…" />
        <DsInput v-model="form.wikidata" label="Wikidata" placeholder="Q123456" />
        <DsInput v-model="form.googleMaps" label="Google Maps" placeholder="https://…" />
        <DsInput v-model="form.coverUrl" label="Cover зургийн эх сурвалж" placeholder="https://…" />
      </div>
    </DsCard>

    <DsCard title="Зуучлалын тохиргоо">
      <p class="gks-uform__note">Энэ хэсгийг импорт хэзээ ч дарж бичихгүй — зөвхөн ажилтан хөтөлнө.</p>
      <div class="gks-uform__switches">
        <DsSwitch v-model="form.acceptsLanguagePrep" label="Хэлний бэлтгэл авдаг" />
        <DsSwitch v-model="form.acceptsFromMongolia" label="Монголоос шууд элсүүлдэг" />
        <DsSwitch v-model="form.isGksEligible" label="GKS тэтгэлэгт хамрагддаг" />
      </div>
      <div class="gks-uform__grid">
        <DsSelect v-model="form.agentContractStatus" label="Агентын гэрээний төлөв" :options="AGENT_OPTIONS" />
      </div>
      <DsTextarea
        v-model="form.commissionNote"
        label="Шимтгэлийн нөхцөл (дотоод)"
        :rows="2"
        hint="Нийтийн хуудсанд хэзээ ч харагдахгүй"
      />
      <DsTextarea
        v-model="form.internalNote"
        label="Дотоод тэмдэглэл"
        :rows="3"
        hint="Нийтийн хуудсанд хэзээ ч харагдахгүй"
      />
    </DsCard>
  </div>
</template>

<style scoped>
.gks-uform { display: flex; flex-direction: column; gap: var(--sp-5); }
.gks-uform__grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--sp-4); }
.gks-uform__grid + .gks-uform__wide,
.gks-uform__grid + :deep(.gks-field) { margin-top: var(--sp-4); }
.gks-uform__note { margin-bottom: var(--sp-4); color: var(--text-muted); font-size: var(--fs-body-sm); }
.gks-uform__switches { display: flex; flex-wrap: wrap; gap: var(--sp-5); margin-bottom: var(--sp-4); }

.gks-uform__list { margin-top: var(--sp-5); border: 0; padding: 0; display: flex; flex-direction: column; gap: var(--sp-3); }
.gks-uform__legend { font-size: var(--fs-label); font-weight: var(--fw-semibold); letter-spacing: var(--ls-label); }
.gks-uform__legend-hint { color: var(--text-subtle); font-size: var(--fs-caption); }
.gks-uform__list-row { display: flex; align-items: flex-start; gap: var(--sp-2); }
.gks-uform__list-row :deep(.gks-field) { flex: 1; }

:deep(.gks-card + .gks-card) { margin-top: 0; }

@media (max-width: 1100px) {
  .gks-uform__grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 700px) {
  .gks-uform__grid { grid-template-columns: 1fr; }
}
</style>
