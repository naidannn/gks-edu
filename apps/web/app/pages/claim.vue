<script setup lang="ts">
/**
 * 1B-17 — the invitation link from a staff-created account. Setting a password
 * here is what turns that row into a login the client owns.
 */
definePageMeta({ layout: 'default' });

/**
 * The invitation lives for seven days (1B-19). After that the only way back in
 * is a human re-sending it from the CRM, so the dead end names who to ask and
 * what number to ring rather than offering a self-service link that does not
 * exist for this flow.
 */
const DEAD_TEXT =
  `Кабинет идэвхжүүлэх холбоос 7 хоног хүчинтэй байсан бөгөөд хугацаа нь дууссан эсвэл өмнө нь `
  + `ашиглагдсан байна. Хариуцсан зөвлөхтэйгээ эсвэл ${COMPANY.phoneLabel} дугаараар холбогдоход `
  + `шинэ урилгыг тань даруй илгээнэ. Бүртгэлээ аль хэдийн идэвхжүүлсэн бол шууд нэвтэрнэ үү.`;

useHead({ title: 'Бүртгэл идэвхжүүлэх' });
useNoIndex();
</script>

<template>
  <AuthSetPassword
    title="Бүртгэлээ идэвхжүүлэх"
    lede="Нууц үгээ тохируулснаар кабинет тань нээгдэж, материалаа илгээх, төлбөрөө төлөх боломжтой болно."
    endpoint="/users/claim"
    submit-label="Бүртгэлээ идэвхжүүлэх"
    success-title="Бүртгэл идэвхжлээ"
    success-text="Одоо имэйл хаяг болон шинэ нууц үгээрээ нэвтэрнэ үү."
    missing-token-text="Энэ хаяг урилгын түлхүүргүй байна. Имэйл дэх холбоосыг бүтнээр нь дарж орно уу."
    dead-token-title="Урилгын хугацаа дууссан"
    :dead-token-text="DEAD_TEXT"
    :retry="{ label: 'Холбоо барих', to: '/contact' }"
  />
</template>
