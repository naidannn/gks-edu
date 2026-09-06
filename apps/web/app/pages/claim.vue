<script setup lang="ts">
/**
 * 1B-17 — the invitation link from a staff-created account. Setting a password
 * here is what turns that row into a login the client owns.
 */
definePageMeta({ layout: 'default' });
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
  />
</template>
