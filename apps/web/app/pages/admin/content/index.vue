<script setup lang="ts">
import type { BannerItem, BannerPlacement, FaqCategory, FaqEntry, PostDetail, PostStatus } from '@gks/shared';

/**
 * 1G-14 — content management: news posts, FAQ entries and the dated promo
 * banner, in one place because they are edited by the same person on the same
 * afternoon.
 *
 * The post editor here is deliberately the *list* plus status/slug control;
 * long-form writing happens in the body field of the same form — there is no
 * separate WYSIWYG, and the content is stored as HTML the public page
 * sanitises (1A-12).
 */
definePageMeta({ middleware: 'admin', layout: 'admin' });
useHead({ title: 'Контент удирдлага' });

type Tab = 'posts' | 'faq' | 'banners';
const tab = ref<Tab>('posts');
const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'posts', label: 'Нийтлэл', icon: 'newspaper' },
  { key: 'faq', label: 'Түгээмэл асуулт', icon: 'circle-help' },
  { key: 'banners', label: 'Баннер', icon: 'megaphone' },
];

const api = useApi();
const errorMsg = ref<string | null>(null);
const notice = ref<string | null>(null);

function fail(error: unknown, fallback: string) {
  errorMsg.value = apiErrorMessage(error, fallback);
}

// ── Posts ──────────────────────────────────────────────────────────────────

const posts = ref<PostDetail[]>([]);
const postForm = reactive({
  id: '' as string,
  slug: '',
  title: '',
  excerpt: '',
  content: '',
  status: 'DRAFT' as PostStatus,
  tags: '',
});
const postSaving = ref(false);

async function loadPosts() {
  try {
    const response = await api.get<{ items: PostDetail[] }>('/posts/admin?limit=100');
    posts.value = response.items;
  } catch (error) {
    fail(error, 'Нийтлэлүүдийг ачаалж чадсангүй');
  }
}

function editPost(post: PostDetail) {
  Object.assign(postForm, {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt ?? '',
    content: post.content,
    status: post.status,
    tags: post.tags.join(', '),
  });
}

function resetPost() {
  Object.assign(postForm, { id: '', slug: '', title: '', excerpt: '', content: '', status: 'DRAFT', tags: '' });
}

async function savePost() {
  errorMsg.value = null;
  postSaving.value = true;
  const body = {
    slug: postForm.slug.trim(),
    title: postForm.title.trim(),
    excerpt: postForm.excerpt.trim() || undefined,
    content: postForm.content,
    status: postForm.status,
    tags: postForm.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
  };
  try {
    if (postForm.id) await api.patch(`/posts/${postForm.id}`, body);
    else await api.post('/posts', body);
    notice.value = 'Нийтлэл хадгалагдлаа.';
    resetPost();
    await loadPosts();
  } catch (error) {
    fail(error, 'Нийтлэлийг хадгалж чадсангүй');
  } finally {
    postSaving.value = false;
  }
}

async function removePost(post: PostDetail) {
  try {
    await api.delete(`/posts/${post.id}`);
    await loadPosts();
  } catch (error) {
    fail(error, 'Устгаж чадсангүй');
  }
}

// ── FAQ ────────────────────────────────────────────────────────────────────

const faqs = ref<FaqEntry[]>([]);
const faqForm = reactive({
  id: '',
  category: 'GENERAL' as FaqCategory,
  question: '',
  answer: '',
  order: 0,
  isPublished: true,
});
const faqSaving = ref(false);
const FAQ_OPTIONS = FAQ_CATEGORY_ORDER.map((category) => ({ value: category, label: FAQ_CATEGORY_LABELS[category] }));

async function loadFaqs() {
  try {
    faqs.value = await api.get<FaqEntry[]>('/faqs/admin');
  } catch (error) {
    fail(error, 'FAQ-г ачаалж чадсангүй');
  }
}

function editFaq(entry: FaqEntry) {
  Object.assign(faqForm, { ...entry, isPublished: true });
}

function resetFaq() {
  Object.assign(faqForm, { id: '', category: 'GENERAL', question: '', answer: '', order: 0, isPublished: true });
}

async function saveFaq() {
  errorMsg.value = null;
  faqSaving.value = true;
  const body = {
    category: faqForm.category,
    question: faqForm.question.trim(),
    answer: faqForm.answer.trim(),
    order: Number(faqForm.order) || 0,
    isPublished: faqForm.isPublished,
  };
  try {
    if (faqForm.id) await api.patch(`/faqs/${faqForm.id}`, body);
    else await api.post('/faqs', body);
    notice.value = 'Асуулт хадгалагдлаа.';
    resetFaq();
    await loadFaqs();
  } catch (error) {
    fail(error, 'Асуултыг хадгалж чадсангүй');
  } finally {
    faqSaving.value = false;
  }
}

async function removeFaq(entry: FaqEntry) {
  try {
    await api.delete(`/faqs/${entry.id}`);
    await loadFaqs();
  } catch (error) {
    fail(error, 'Устгаж чадсангүй');
  }
}

// ── Banners ────────────────────────────────────────────────────────────────

const banners = ref<BannerItem[]>([]);
const bannerForm = reactive({
  id: '',
  placement: 'SITE_TOP' as BannerPlacement,
  titleMn: '',
  bodyMn: '',
  linkUrl: '',
  linkLabel: '',
  startsAt: '',
  endsAt: '',
  isPublished: false,
  sortOrder: 0,
});
const bannerSaving = ref(false);
const PLACEMENT_OPTIONS = (Object.keys(BANNER_PLACEMENT_LABELS) as BannerPlacement[]).map((value) => ({
  value,
  label: BANNER_PLACEMENT_LABELS[value],
}));

async function loadBanners() {
  try {
    banners.value = await api.get<BannerItem[]>('/banners/admin');
  } catch (error) {
    fail(error, 'Баннеруудыг ачаалж чадсангүй');
  }
}

function editBanner(banner: BannerItem) {
  Object.assign(bannerForm, {
    ...banner,
    bodyMn: banner.bodyMn ?? '',
    linkUrl: banner.linkUrl ?? '',
    linkLabel: banner.linkLabel ?? '',
    startsAt: banner.startsAt?.slice(0, 10) ?? '',
    endsAt: banner.endsAt?.slice(0, 10) ?? '',
  });
}

function resetBanner() {
  Object.assign(bannerForm, {
    id: '',
    placement: 'SITE_TOP',
    titleMn: '',
    bodyMn: '',
    linkUrl: '',
    linkLabel: '',
    startsAt: '',
    endsAt: '',
    isPublished: false,
    sortOrder: 0,
  });
}

async function saveBanner() {
  errorMsg.value = null;
  bannerSaving.value = true;
  const body = {
    placement: bannerForm.placement,
    titleMn: bannerForm.titleMn.trim(),
    bodyMn: bannerForm.bodyMn.trim() || undefined,
    linkUrl: bannerForm.linkUrl.trim() || undefined,
    linkLabel: bannerForm.linkLabel.trim() || undefined,
    startsAt: bannerForm.startsAt ? new Date(bannerForm.startsAt).toISOString() : undefined,
    endsAt: bannerForm.endsAt ? new Date(bannerForm.endsAt).toISOString() : undefined,
    isPublished: bannerForm.isPublished,
    sortOrder: Number(bannerForm.sortOrder) || 0,
  };
  try {
    if (bannerForm.id) await api.patch(`/banners/${bannerForm.id}`, body);
    else await api.post('/banners', body);
    notice.value = 'Баннер хадгалагдлаа.';
    resetBanner();
    await loadBanners();
  } catch (error) {
    fail(error, 'Баннерыг хадгалж чадсангүй');
  } finally {
    bannerSaving.value = false;
  }
}

async function removeBanner(banner: BannerItem) {
  try {
    await api.delete(`/banners/${banner.id}`);
    await loadBanners();
  } catch (error) {
    fail(error, 'Устгаж чадсангүй');
  }
}

onMounted(() => {
  void loadPosts();
  void loadFaqs();
  void loadBanners();
});
</script>

<template>
  <div class="gks-page">
    <header class="gks-page__head">
      <div class="gks-page__heading">
        <span class="gks-eyebrow">§15</span>
        <h1 class="gks-page__title">Контент удирдлага</h1>
      </div>
    </header>

    <nav class="gks-tabs" aria-label="Контентын төрөл">
      <button
        v-for="item in TABS"
        :key="item.key"
        type="button"
        class="gks-tab"
        :class="{ 'gks-tab--active': tab === item.key }"
        @click="tab = item.key"
      >
        <DsIcon :name="item.icon" :size="16" />
        <span>{{ item.label }}</span>
      </button>
    </nav>

    <p v-if="errorMsg" class="gks-content__error">{{ errorMsg }}</p>
    <p v-if="notice" class="gks-content__notice">{{ notice }}</p>

    <!-- Нийтлэл -->
    <template v-if="tab === 'posts'">
      <DsCard :title="postForm.id ? 'Нийтлэл засах' : 'Шинэ нийтлэл'">
        <form class="gks-form-grid" @submit.prevent="savePost">
          <DsInput v-model="postForm.title" label="Гарчиг" required />
          <DsInput v-model="postForm.slug" label="Slug" hint="URL-д харагдах нэр" required />
          <DsInput v-model="postForm.excerpt" label="Товч тайлбар" />
          <DsInput v-model="postForm.tags" label="Шошго" hint="Таслалаар тусгаарлана" />
          <DsSelect
            v-model="postForm.status"
            label="Төлөв"
            :options="[{ value: 'DRAFT', label: POST_STATUS_LABELS.DRAFT }, { value: 'PUBLISHED', label: POST_STATUS_LABELS.PUBLISHED }]"
          />
          <DsTextarea v-model="postForm.content" label="Агуулга (HTML)" :rows="10" class="gks-form-grid__full" required />
          <div class="gks-content__actions">
            <DsButton type="submit" variant="accent" :disabled="postSaving">
              {{ postSaving ? 'Хадгалж байна…' : 'Хадгалах' }}
            </DsButton>
            <DsButton v-if="postForm.id" variant="secondary" @click="resetPost">Болих</DsButton>
          </div>
        </form>
      </DsCard>

      <DsCard title="Нийтлэлүүд">
        <p v-if="!posts.length" class="gks-empty">Нийтлэл алга.</p>
        <ul v-else class="gks-content__list">
          <li v-for="post in posts" :key="post.id" class="gks-content__item">
            <div class="gks-content__item-main">
              <p class="gks-content__item-title">{{ post.title }}</p>
              <p class="gks-content__item-meta gks-tnum">
                /{{ post.slug }} · {{ formatNumericDate(post.publishedAt) }}
              </p>
            </div>
            <DsBadge :tone="post.status === 'PUBLISHED' ? 'success' : 'neutral'">
              {{ POST_STATUS_LABELS[post.status] }}
            </DsBadge>
            <div class="gks-content__item-actions">
              <DsButton variant="secondary" size="sm" icon-left="pencil" @click="editPost(post)">Засах</DsButton>
              <DsButton variant="secondary" size="sm" icon-left="trash-2" @click="removePost(post)">Устгах</DsButton>
            </div>
          </li>
        </ul>
      </DsCard>
    </template>

    <!-- FAQ -->
    <template v-else-if="tab === 'faq'">
      <DsCard :title="faqForm.id ? 'Асуулт засах' : 'Шинэ асуулт'">
        <form class="gks-form-grid" @submit.prevent="saveFaq">
          <DsSelect v-model="faqForm.category" label="Ангилал" :options="FAQ_OPTIONS" />
          <DsInput v-model.number="faqForm.order" label="Эрэмбэ" type="number" />
          <DsInput v-model="faqForm.question" label="Асуулт" class="gks-form-grid__full" required />
          <DsTextarea v-model="faqForm.answer" label="Хариулт" :rows="6" class="gks-form-grid__full" required />
          <div class="gks-content__actions">
            <DsSwitch v-model="faqForm.isPublished" label="Нийтлэх" />
            <DsButton type="submit" variant="accent" :disabled="faqSaving">
              {{ faqSaving ? 'Хадгалж байна…' : 'Хадгалах' }}
            </DsButton>
            <DsButton v-if="faqForm.id" variant="secondary" @click="resetFaq">Болих</DsButton>
          </div>
        </form>
      </DsCard>

      <DsCard title="Асуултууд">
        <p v-if="!faqs.length" class="gks-empty">Асуулт алга.</p>
        <ul v-else class="gks-content__list">
          <li v-for="entry in faqs" :key="entry.id" class="gks-content__item">
            <div class="gks-content__item-main">
              <p class="gks-content__item-title">{{ entry.question }}</p>
              <p class="gks-content__item-meta">{{ FAQ_CATEGORY_LABELS[entry.category] }}</p>
            </div>
            <div class="gks-content__item-actions">
              <DsButton variant="secondary" size="sm" icon-left="pencil" @click="editFaq(entry)">Засах</DsButton>
              <DsButton variant="secondary" size="sm" icon-left="trash-2" @click="removeFaq(entry)">Устгах</DsButton>
            </div>
          </li>
        </ul>
      </DsCard>
    </template>

    <!-- Баннер -->
    <template v-else>
      <DsCard :title="bannerForm.id ? 'Баннер засах' : 'Шинэ баннер'">
        <form class="gks-form-grid" @submit.prevent="saveBanner">
          <DsSelect v-model="bannerForm.placement" label="Байршил" :options="PLACEMENT_OPTIONS" />
          <DsInput v-model.number="bannerForm.sortOrder" label="Эрэмбэ" type="number" />
          <DsInput v-model="bannerForm.titleMn" label="Гарчиг" class="gks-form-grid__full" required />
          <DsTextarea v-model="bannerForm.bodyMn" label="Тайлбар" :rows="3" class="gks-form-grid__full" />
          <DsInput v-model="bannerForm.linkUrl" label="Холбоос" hint="Жишээ: /gks-scholarship" />
          <DsInput v-model="bannerForm.linkLabel" label="Товчны текст" />
          <DsInput v-model="bannerForm.startsAt" label="Эхлэх огноо" type="date" />
          <DsInput v-model="bannerForm.endsAt" label="Дуусах огноо" type="date" />
          <div class="gks-content__actions">
            <DsSwitch v-model="bannerForm.isPublished" label="Нийтлэх" />
            <DsButton type="submit" variant="accent" :disabled="bannerSaving">
              {{ bannerSaving ? 'Хадгалж байна…' : 'Хадгалах' }}
            </DsButton>
            <DsButton v-if="bannerForm.id" variant="secondary" @click="resetBanner">Болих</DsButton>
          </div>
        </form>
      </DsCard>

      <DsCard title="Баннерууд">
        <p v-if="!banners.length" class="gks-empty">Баннер алга.</p>
        <ul v-else class="gks-content__list">
          <li v-for="banner in banners" :key="banner.id" class="gks-content__item">
            <div class="gks-content__item-main">
              <p class="gks-content__item-title">{{ banner.titleMn }}</p>
              <p class="gks-content__item-meta gks-tnum">
                {{ BANNER_PLACEMENT_LABELS[banner.placement] }} ·
                {{ formatNumericDate(banner.startsAt) }} – {{ formatNumericDate(banner.endsAt) }}
              </p>
            </div>
            <DsBadge :tone="banner.isPublished ? 'success' : 'neutral'">
              {{ banner.isPublished ? 'Нийтэлсэн' : 'Ноорог' }}
            </DsBadge>
            <div class="gks-content__item-actions">
              <DsButton variant="secondary" size="sm" icon-left="pencil" @click="editBanner(banner)">Засах</DsButton>
              <DsButton variant="secondary" size="sm" icon-left="trash-2" @click="removeBanner(banner)">Устгах</DsButton>
            </div>
          </li>
        </ul>
      </DsCard>
    </template>
  </div>
</template>

<style scoped>
.gks-content__error { color: var(--danger-fg); font-size: var(--fs-body-sm); }
.gks-content__notice { color: var(--success-fg); font-size: var(--fs-body-sm); }
.gks-content__actions { grid-column: 1 / -1; display: flex; gap: var(--sp-3); align-items: center; }
.gks-content__list { list-style: none; margin: 0; padding: 0; }
.gks-content__item {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3) 0;
  border-bottom: var(--border-hair) solid var(--line-hairline);
}
.gks-content__item:last-child { border-bottom: none; }
.gks-content__item-main { flex: 1; min-width: 0; }
.gks-content__item-title { font-size: var(--fs-body-sm); font-weight: var(--fw-semibold); }
.gks-content__item-meta { font-size: var(--fs-micro); color: var(--text-subtle); }
.gks-content__item-actions { display: flex; gap: var(--sp-2); }
</style>

