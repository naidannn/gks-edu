<script setup lang="ts">
/** Step two of "нууц үгээ мартсан" — the link from the reset email lands here. */
definePageMeta({ layout: 'default' });
useHead({ title: 'Шинэ нууц үг' });
</script>

<template>
  <AuthSetPassword
    title="Шинэ нууц үг тохируулах"
    lede="Шинэ нууц үгээ оруулсны дараа бүх төхөөрөмж дээрх нэвтрэлт хаагдаж, дахин нэвтэрнэ."
    endpoint="/auth/password/reset"
    submit-label="Нууц үг хадгалах"
    success-title="Нууц үг шинэчлэгдлээ"
    success-text="Шинэ нууц үгээрээ нэвтэрнэ үү."
    missing-token-text="Энэ хаяг сэргээх түлхүүргүй байна. Имэйл дэх холбоосыг бүтнээр нь дарж орно уу."
  />
</template>
