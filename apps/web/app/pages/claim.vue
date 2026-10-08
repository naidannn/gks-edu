<script setup lang="ts">
/**
 * 1B-17 — the invitation link from a staff-created account. Setting a password
 * here is what turns that row into a login the client owns.
 */
definePageMeta({ layout: 'default' });

/**
 * The invitation lives for seven days (1B-19). An expired one is not a dead
 * end: the reset flow sets a first password on an office-created account just
 * as well — it needs only the inbox the invitation went to — so the way
 * forward is self-service, with the consultant as the fallback when the
 * address itself is wrong.
 */
const DEAD_TEXT =
  `Кабинет идэвхжүүлэх холбоос 7 хоног хүчинтэй байсан бөгөөд хугацаа нь дууссан эсвэл өмнө нь `
  + `ашиглагдсан байна. Доорх холбоосоор и-мэйлээ оруулбал нууц үг тохируулах шинэ холбоос шууд очно. `
  + `И-мэйл ирэхгүй бол хариуцсан зөвлөхтэйгээ эсвэл ${COMPANY.phoneLabel} дугаараар холбогдоно уу. `
  + `Бүртгэлээ аль хэдийн идэвхжүүлсэн бол шууд нэвтэрнэ үү.`;

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
    sign-in
    missing-token-text="Энэ хаяг урилгын түлхүүргүй байна. Имэйл дэх холбоосыг бүтнээр нь дарж орно уу."
    dead-token-title="Урилгын хугацаа дууссан"
    :dead-token-text="DEAD_TEXT"
    :retry="{ label: 'Шинэ холбоос авах', to: '/forgot-password' }"
  />
</template>
