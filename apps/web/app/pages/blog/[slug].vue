<script setup lang="ts">
import type { PostDetail } from '@gks/shared';

/** One published post (1A-12). SEO meta + JSON-LD Article (1A-19). */
const route = useRoute();
const slug = computed(() => String(route.params.slug));

const { data: post, error } = await useApiFetch<PostDetail>(() => `/posts/${slug.value}`);

if (error.value) {
  throw createError({ statusCode: 404, statusMessage: 'Нийтлэл олдсонгүй' });
}

function formatDate(value: string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleDateString('mn-MN', { year: 'numeric', month: 'long', day: 'numeric' });
}

const title = computed(() => post.value?.seoTitle || post.value?.title || 'Нийтлэл');
const description = computed(() => post.value?.seoDescription || post.value?.excerpt || undefined);

useHead({
  title,
  script: post.value
    ? [
        {
          type: 'application/ld+json',
          innerHTML: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: post.value.title,
            datePublished: post.value.publishedAt ?? undefined,
            dateModified: post.value.updatedAt,
            author: post.value.author?.name ? { '@type': 'Person', name: post.value.author.name } : undefined,
            image: post.value.coverImagePath ?? undefined,
            description: description.value,
          }),
        },
      ]
    : [],
});
useSeoMeta({
  description,
  ogTitle: title,
  ogDescription: description,
  ogType: 'article',
  ogImage: post.value?.coverImagePath ?? undefined,
});
</script>

<template>
  <article v-if="post" class="gks-post">
    <NuxtLink to="/blog" class="gks-post__back">
      <DsIcon name="arrow-left" :size="16" /> Бүх нийтлэл
    </NuxtLink>

    <header class="gks-post__head">
      <p v-if="post.publishedAt" class="gks-post__date gks-tnum">{{ formatDate(post.publishedAt) }}</p>
      <h1 class="gks-post__title">{{ post.title }}</h1>
      <div v-if="post.tags.length" class="gks-post__tags">
        <DsTag v-for="tag in post.tags" :key="tag">{{ tag }}</DsTag>
      </div>
    </header>

    <img v-if="post.coverImagePath" :src="post.coverImagePath" :alt="post.title" class="gks-post__cover">

    <!-- Only ADMIN-authored content reaches here (posts.controller.ts is Roles(ADMIN)-gated on writes),
         so this is the same trust boundary as any staff CMS — sanitize before this if authoring ever opens up. -->
    <div class="gks-post__content" v-html="post.content" />

    <footer class="gks-post__cta">
      <DsCard title="Хувийн зөвлөгөө хэрэгтэй юу?">
        <p>Танд тохирох сургууль, хөтөлбөр, тэтгэлгийн боломжийг мэргэжилтэн тодорхойлж өгнө.</p>
        <DsButton variant="accent" icon-right="arrow-right" @click="navigateTo('/consultation')">
          Зөвлөгөө авах
        </DsButton>
      </DsCard>
    </footer>
  </article>
</template>

<style scoped>
.gks-post { display: flex; flex-direction: column; gap: var(--sp-6); max-width: var(--container-prose); margin: 0 auto; }
.gks-post__back {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--fs-body-sm);
  font-weight: var(--fw-medium);
  color: var(--text-muted);
  text-decoration: none;
  align-self: flex-start;
}
.gks-post__back:hover { color: var(--brand-600); }

.gks-post__date { font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-post__title {
  margin-top: var(--sp-2);
  font-family: var(--font-display);
  font-size: var(--fs-h1);
  font-weight: var(--fw-bold);
  line-height: var(--lh-tight);
  letter-spacing: var(--ls-heading);
}
.gks-post__tags { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-top: var(--sp-3); }

.gks-post__cover { width: 100%; border-radius: var(--radius-1); border: var(--border-hair) solid var(--line-hairline); }

.gks-post__content {
  font-size: var(--fs-body);
  line-height: var(--lh-body);
  color: var(--text-body);
}
.gks-post__content :deep(h2) { margin-top: var(--sp-6); font-size: var(--fs-h4); font-weight: var(--fw-bold); }
.gks-post__content :deep(p) { margin-top: var(--sp-4); }
.gks-post__content :deep(ul),
.gks-post__content :deep(ol) { margin-top: var(--sp-4); padding-left: 1.4em; }
.gks-post__content :deep(a) { color: var(--brand-600); text-decoration: underline; text-underline-offset: 3px; }

.gks-post__cta { margin-top: var(--sp-4); }
.gks-post__cta p { color: var(--text-muted); margin-bottom: var(--sp-4); }
</style>
