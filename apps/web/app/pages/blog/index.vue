<script setup lang="ts">
import type { PostCard } from '@gks/shared';

/** Public blog/news list (1A-12). */
type Paginated = { items: PostCard[]; meta: { page: number; limit: number; total: number; totalPages: number } };

const route = useRoute();
const router = useRouter();

const page = computed(() => {
  const parsed = Number.parseInt(String(route.query.page ?? '1'), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
});

const { data, status } = await useApiFetch<Paginated>('/posts', {
  query: computed(() => ({ page: page.value, limit: 12 })),
  lazy: true,
});

const totalPages = computed(() => data.value?.meta.totalPages ?? 1);

function goToPage(next: number) {
  router.push({ query: { ...route.query, page: String(next) } });
}

function formatDate(value: string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleDateString('mn-MN', { year: 'numeric', month: 'long', day: 'numeric' });
}

useHead({ title: 'Мэдээ, нийтлэл' });
useSeoMeta({
  description: 'Солонгост суралцах, элсэлт, виз, тэтгэлэгтэй холбоотой зөвлөгөө, мэдээ, нийтлэл.',
  ogTitle: 'Мэдээ, нийтлэл · GKS Edu',
  ogType: 'website',
});
</script>

<template>
  <div class="gks-blog">
    <header class="gks-blog__head">
      <span class="gks-eyebrow">Блог</span>
      <h1 class="gks-blog__title">Мэдээ, нийтлэл</h1>
      <p class="gks-blog__lede">Солонгост суралцах, элсэлт, виз, тэтгэлэгтэй холбоотой зөвлөгөө, шинэ мэдээ.</p>
    </header>

    <div v-if="status === 'pending' && !data" class="gks-blog__grid">
      <div v-for="n in 6" :key="n" class="gks-blog__skeleton" />
    </div>

    <template v-else-if="data?.items.length">
      <ul class="gks-blog__grid">
        <li v-for="post in data.items" :key="post.id">
          <NuxtLink :to="`/blog/${post.slug}`" class="gks-post-card">
            <div v-if="post.coverImagePath" class="gks-post-card__cover">
              <img :src="post.coverImagePath" :alt="post.title" loading="lazy">
            </div>
            <div class="gks-post-card__body">
              <p v-if="post.publishedAt" class="gks-post-card__date gks-tnum">{{ formatDate(post.publishedAt) }}</p>
              <h2 class="gks-post-card__title">{{ post.title }}</h2>
              <p v-if="post.excerpt" class="gks-post-card__excerpt">{{ post.excerpt }}</p>
              <div v-if="post.tags.length" class="gks-post-card__tags">
                <DsTag v-for="tag in post.tags" :key="tag">{{ tag }}</DsTag>
              </div>
            </div>
          </NuxtLink>
        </li>
      </ul>

      <nav v-if="totalPages > 1" class="gks-pager" aria-label="Хуудаслалт">
        <DsButton variant="secondary" size="sm" icon-left="chevron-left" :disabled="page <= 1" @click="goToPage(page - 1)">
          Өмнөх
        </DsButton>
        <span class="gks-pager__status gks-tnum">{{ page }} / {{ totalPages }}</span>
        <DsButton variant="secondary" size="sm" icon-right="chevron-right" :disabled="page >= totalPages" @click="goToPage(page + 1)">
          Дараах
        </DsButton>
      </nav>
    </template>

    <DsCard v-else>
      <p class="gks-blog__empty">Одоогоор нийтлэл нэмэгдээгүй байна.</p>
    </DsCard>
  </div>
</template>

<style scoped>
.gks-blog { display: flex; flex-direction: column; gap: var(--sp-7); }
.gks-blog__title {
  margin-top: var(--sp-2);
  font-family: var(--font-display);
  font-size: var(--fs-h1);
  font-weight: var(--fw-bold);
  letter-spacing: var(--ls-heading);
}
.gks-blog__lede { margin-top: var(--sp-3); max-width: var(--container-prose); color: var(--text-muted); line-height: var(--lh-body); }

.gks-blog__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--sp-5); list-style: none; }
.gks-blog__skeleton { height: 280px; background: linear-gradient(var(--n-050), var(--n-100)); border: var(--border-hair) solid var(--line-hairline); }
.gks-blog__empty { color: var(--text-muted); text-align: center; padding: var(--sp-4) 0; }

.gks-post-card {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface-card);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-1);
  text-decoration: none;
  color: inherit;
  overflow: hidden;
  transition: var(--transition-control);
}
.gks-post-card:hover { border-color: var(--line-ink); box-shadow: var(--shadow-raised); }
.gks-post-card__cover { aspect-ratio: 16 / 9; background: var(--surface-sunken); overflow: hidden; }
.gks-post-card__cover img { width: 100%; height: 100%; object-fit: cover; }
.gks-post-card__body { padding: var(--sp-5); display: flex; flex-direction: column; gap: var(--sp-2); }
.gks-post-card__date { font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-post-card__title {
  font-family: var(--font-display);
  font-size: var(--fs-body-lg);
  font-weight: var(--fw-bold);
  line-height: var(--lh-snug);
  color: var(--text-strong);
}
.gks-post-card__excerpt { font-size: var(--fs-body-sm); color: var(--text-muted); line-height: var(--lh-body); }
.gks-post-card__tags { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-top: var(--sp-1); }

.gks-pager { display: flex; align-items: center; justify-content: center; gap: var(--sp-4); padding-top: var(--sp-4); }
.gks-pager__status { font-size: var(--fs-body-sm); color: var(--text-muted); }
</style>
