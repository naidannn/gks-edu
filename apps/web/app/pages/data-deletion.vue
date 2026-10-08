<script setup lang="ts">
import type { LegalSection } from '~/components/legal/Document.vue';

/**
 * 2F — Өгөгдөл устгах заавар (Meta's "Data Deletion Instructions URL").
 *
 * Meta requires every app that receives user data through its platform to
 * publish how a person gets that data deleted, and App Review opens this URL.
 * The steps describe what the office can actually do today: an admin deletes a
 * Facebook thread from `/admin/facebook`, which removes its messages, the
 * comments tied to it and the assistant's session. A lead the person asked us
 * to create is CRM data under the main privacy policy, so it is named
 * separately rather than silently swept up.
 *
 * Bilingual on purpose: the reviewer reads English, the people who use it read
 * Mongolian.
 */
const SECTIONS: LegalSection[] = [
  {
    id: 'what',
    title: 'Юуг устгах вэ',
    blocks: [
      {
        type: 'p',
        text: `Та ${COMPANY.name}-ийн Facebook хуудас руу Messenger-ээр бичсэн, эсвэл манай постны доор сэтгэгдэл үлдээсэн бол бид дараах мэдээллийг хадгалдаг: Meta-гийн олгосон танигч (page-scoped ID), Facebook дээрх нэр, профайл зураг, мессеж, хавсралт, сэтгэгдэл, AI туслахын тан руу бичсэн хариулт.`,
      },
      {
        type: 'p',
        text: 'Хүсэлт ирснээс хойш 30 хоногийн дотор эдгээрийг бүгдийг манай системээс бүрмөсөн устгана.',
      },
    ],
  },
  {
    id: 'how',
    title: 'Хэрхэн хүсэлт гаргах вэ',
    blocks: [
      {
        type: 'list',
        items: [
          'Манай Facebook хуудас руу Messenger-ээр «Миний мэдээллийг устгана уу» гэж бичнэ. Эсвэл',
          `${COMPANY.email} хаяг руу «Facebook өгөгдөл устгах хүсэлт» гарчигтай имэйл илгээж, Facebook дээрх нэрээ бичнэ. Эсвэл`,
          `${COMPANY.phoneLabel} дугаарт залгана.`,
        ],
      },
      {
        type: 'p',
        text: 'Устгасны дараа бид танд Messenger эсвэл имэйлээр мэдэгдэнэ. Хэн хүсэлт гаргаж байгааг тодорхойлох шаардлагатай бол нэмэлт баталгаажуулалт асууж болно.',
      },
      {
        type: 'note',
        text: 'Messenger дээрх ярианы хуулбар таны Facebook бүртгэлд Meta-гийн талд хадгалагдсан хэвээр байна. Түүнийг Messenger-ийн «Delete chat» үйлдлээр өөрөө устгана.',
      },
    ],
  },
  {
    id: 'other',
    title: 'Бусад мэдээлэл',
    blocks: [
      {
        type: 'p',
        text: 'Хэрэв та яриан дундаа утасны дугаараа өгч зөвлөгөө хүссэн, эсвэл бидэнтэй гэрээ байгуулсан бол тэр мэдээлэл «Нууцлалын бодлого»-ын дагуу тусад нь хадгалагдана. Түүнийг ч устгуулах бол хүсэлтдээ дурдана уу — хуулиар хадгалах үүрэгтэй гэрээ, төлбөрийн баримтаас бусдыг устгана.',
      },
    ],
  },
  {
    id: 'english',
    title: 'Data deletion instructions (English)',
    blocks: [
      {
        type: 'p',
        text: `If you have messaged the ${COMPANY.name} Facebook Page or commented on our posts, we store your page-scoped ID, Facebook name and profile picture, your messages, attachments and comments, and the replies our AI assistant sent you.`,
      },
      {
        type: 'list',
        items: [
          'To have this data deleted, send "Delete my data" to our Facebook Page in Messenger, or',
          `email ${COMPANY.email} with the subject "Facebook data deletion request" and your Facebook name, or`,
          `call ${COMPANY.phone}.`,
        ],
      },
      {
        type: 'p',
        text: 'We delete all of it from our systems within 30 days of the request and confirm by Messenger or email. A consultation request or contract you made with us is covered by our Privacy Policy; tell us if you want it deleted too (records we must keep by law excepted). The copy of the conversation in your own Messenger account is held by Meta; you can delete it with Messenger\'s "Delete chat".',
      },
    ],
  },
];

useHead({ title: 'Өгөгдөл устгах заавар' });
useSeoMeta({
  description:
    'GKS EDU GROUP-ийн Facebook хуудас, Messenger-ээр харилцсан мэдээллээ хэрхэн устгуулах вэ. Data deletion instructions.',
  ogTitle: 'Өгөгдөл устгах заавар · GKS Edu',
  ogType: 'website',
});
</script>

<template>
  <LegalDocument
    eyebrow="Хууль зүйн мэдээлэл"
    title="Өгөгдөл устгах заавар"
    lede="Facebook хуудас, Messenger-ээр бидэнтэй харилцсан мэдээллээ хэзээ ч устгуулж болно. Хүсэлт ирснээс хойш 30 хоногийн дотор устгаж, танд мэдэгдэнэ."
    :sections="SECTIONS"
  />
</template>
