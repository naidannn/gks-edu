# AWS S3 bucket үүсгэх ба файл хадгалалтыг шилжүүлэх

Харилцагчийн бичиг баримт (паспорт, гэрээний скан, дипломын хуулбар) одоо
серверийн диск дээр, **нөөцлөлтгүй** хэвтэж байна. Энэ баримт түүнийг хувийн
S3 bucket руу шилжүүлэх бүх алхмыг агуулна.

Кодын тал бэлэн: `STORAGE_DRIVER=s3` болгомогц `S3StorageDriver` ажиллана.
Үлдсэн нь AWS талын тохиргоо ба нэг удаагийн нүүлгэлт.

> **Юуны өмнө.** Bucket нь **хувийн** (private) байна. Файл руу хүрэх цорын ганц
> зам нь өмнөх шигээ API-гийн `GET /files/:token` — 5 минутын хугацаатай,
> эрх шалгасны дараа гарсан HMAC гарын үсэг. S3 дээр public access нээх,
> эсвэл presigned S3 URL тараах шаардлага **байхгүй**.

---

## 0. Production дээр файлууд хоёр хавтаст тарсан байгааг мэдэж байх

`STORAGE_LOCAL_DIR=/var/www/gks-edu/storage` гэсэн үнэмлэхүй зам нь урьд нь
`path.join(cwd, ...)`-аар дамждаг байсан тул бодитоор
`/var/www/gks-edu/api/var/www/gks-edu/storage` болж хувирдаг байв. Үүнээс болж
серверт хоёр сан үүссэн:

| Хавтас | Файл | Төлөв |
|---|---|---|
| `/var/www/gks-edu/storage` | 6 | 9-р сарын 4-ний өмнөх — **апп одоо уншиж чадахгүй байгаа** |
| `/var/www/gks-edu/api/var/www/gks-edu/storage` | 17 (23MB) | идэвхтэй |

Давхардсан түлхүүр байхгүй тул хоёуланг нь **нэг bucket руу** хуулна — тэгснээр
уншигдахаа больсон 6 файл бас эргэж ирнэ. `LocalStorageDriver` дээрх алдаа
(`join` → `resolve`) энэ өөрчлөлтөд аль хэдийн зассан.

---

## 1. Bucket үүсгэх (AWS Console)

1. [S3 console](https://s3.console.aws.amazon.com/s3/buckets) → **Create bucket**
2. **Bucket name**: `gksedu` — 2026-09-13-нд үүсгэсэн бодит нэр.
   Нэр дэлхий даяар давхцахгүй байх ёстой тул өөр нэр сонгосон бол IAM
   policy доторх хоёр ARN болон `.env` дэх `S3_BUCKET`-ыг зэрэг солино.
3. **AWS Region**: **Asia Pacific (Singapore) `ap-southeast-1`**
   Сервер тэнд байгаа. Өөр бүсэд байрлуулбал татах болгонд бүс хоорондын
   дамжуулалтын төлбөр нэмэгдэнэ.
4. **Object Ownership**: `ACLs disabled` (анхдагч) — хэвээр
5. **Block Public Access**: `Block all public access` гэсэн дээд чагт
   **асаалттай хэвээр** (анхдагчаар тийм байдаг). Доорх 4 дэд чагт нь дээдийг
   нь асаасан үед автоматаар чагтлагдаж, саарал болно — тэдгээрт гар хүрэх
   шаардлагагүй.

   Дээдийг нь тайлбал л 4 нь тус тусдаа сонгогдох болж, AWS "энэ bucket нийтэд
   нээлттэй болж мэднэ" гэсэн нэмэлт баталгаа шаардана. Тэр баталгаа гарч ирвэл
   буруу зүгт явж байна гэсэн үг — энэ бол хамгийн чухал сонголт.

   Аль хэдийн тайлж үүсгэсэн бол дараа нь засаж болно: bucket → **Permissions**
   → *Block public access (bucket settings)* → Edit → чагтлаад Save → `confirm`.
   Жагсаалт дээр **Access** багана `Bucket and objects not public` гэж
   бичигдсэн байвал зөв.

   Энэ тохиргоо манай апп-д саад болохгүй: зөвхөн **аноним** хандалтыг хаадаг
   бөгөөд API нь `gksedu-api` IAM хэрэглэгчийн түлхүүрээр баталгаажсан хүсэлт
   явуулдаг.
6. **Bucket Versioning**: **Enable**
   Санамсаргүй дарж бичих/устгахаас хамгаална. Файлууд жижиг тул өртөг
   мэдэгдэхүйц нэмэгдэхгүй.
7. **Default encryption**: `SSE-S3 (SSE-S3)` — анхдагч, хэвээр
8. **Create bucket**

---

## 2. Зөвхөн энэ bucket-д эрхтэй IAM хэрэглэгч

Сервер нь бусад 10 аппликейшнтай **хуваалцсан** машин. Тиймээс EC2 instance
role хавсаргавал bucket тэр бүх аппд нээгдэнэ — оронд нь зөвхөн энэ bucket-д
эрхтэй тусдаа хэрэглэгч үүсгэнэ.

### 2.1 Policy

[IAM → Policies](https://console.aws.amazon.com/iam/home#/policies) →
**Create policy** → **JSON** таб → дараахыг буулгана
(`gksedu`-ыг өөрийн bucket-ийн нэрээр солино):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListOwnBucket",
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::gksedu"
    },
    {
      "Sid": "ReadWriteObjects",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::gksedu/*"
    }
  ]
}
```

Нэр: `gksedu-files-rw` → **Create policy**

`s3:DeleteObject` хэрэгтэй — устгал нь логик (`deleted/` угтвар руу хуулаад
эхийг нь арилгана), тиймээс хуулсны дараа эхийг устгах эрх шаардана.
`s3:DeleteObjectVersion` **өгөхгүй**: versioning асаалттай тул хуучин
хувилбарууд эрхийн хувьд ч хүрэхгүй үлдэнэ.

### 2.2 Хэрэглэгч

1. [IAM → Users](https://console.aws.amazon.com/iam/home#/users) → **Create user**
2. Нэр: `gksedu-api`
3. "Provide user access to the AWS Management Console" — **чагтлахгүй**
   (энэ хэрэглэгч зөвхөн программын түлхүүрээр ажиллана)
4. **Permissions options** → `Attach policies directly` → `gksedu-files-rw` сонгоно
5. **Create user**

### 2.3 Access key

1. Үүссэн хэрэглэгч дээр дарж → **Security credentials** таб
2. **Access keys** → **Create access key**
3. Use case: **Application running outside AWS** → Next → Create
4. **Access key ID** ба **Secret access key**-г хуулж авна.
   Secret дахин харагдахгүй — яг одоо `.env`-дээ буулгах эсвэл найдвартай
   газар хадгална.

---

## 3. Локал дээр турших

Эхлээд өөрийн машин дээр шалгана — production-ыг хамгийн сүүлд хөдөлгөнө.

`/Users/user/amarhan/projects/gks-edu/.env` (репогийн үндсэн `.env`) дотор:

```bash
STORAGE_DRIVER=s3
S3_BUCKET=gksedu
AWS_REGION=ap-southeast-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
```

Дараа нь:

```bash
pnpm storage:migrate --dry     # юу хуулагдахыг харуулна, юу ч бичихгүй
pnpm storage:migrate           # локал 6 файлыг bucket руу хуулна
pnpm dev
```

Шалгах зүйл: админ дээр нэг гэрээний PDF нээгдэх, нэг шинэ файл байршуулах.
S3 console дээр объект гарч ирвэл ажиллаж байна.

> `STORAGE_DRIVER` буруу бичигдвэл апп **boot дээрээ унана** — чимээгүйгээр
> `local` руу буцахгүй. `S3_BUCKET` дутуу байсан ч мөн адил.

---

## 4. Production руу шилжүүлэх

### 4.1 Серверийн файлуудыг татаж авах

Скрипт `tsx`-ээр ажилладаг бөгөөд серверт эх код байхгүй тул нүүлгэлтийг
хөгжүүлэгчийн машин дээрээс хийнэ. Хоёр хавтсыг тус тусад нь татна:

```bash
mkdir -p /tmp/gks-storage
rsync -avz -e "ssh -i deploy/hurdan.pem" \
  ubuntu@ec2-13-214-22-1.ap-southeast-1.compute.amazonaws.com:/var/www/gks-edu/storage/ \
  /tmp/gks-storage/
rsync -avz -e "ssh -i deploy/hurdan.pem" \
  ubuntu@ec2-13-214-22-1.ap-southeast-1.compute.amazonaws.com:/var/www/gks-edu/api/var/www/gks-edu/storage/ \
  /tmp/gks-storage/
```

Хоёр дахь `rsync` эхнийхийг дарж бичихгүй — түлхүүрүүд давхцахгүй (§0).

### 4.2 Bucket руу хуулах

```bash
pnpm storage:migrate --from /tmp/gks-storage --dry
pnpm storage:migrate --from /tmp/gks-storage
```

23 орчим файл гарч ирэх ёстой. Скрипт **идэмпотент** — тасарвал дахин ажиллуулна,
аль хэдийн байгаа (ижил хэмжээтэй) объектыг алгасна.

### 4.3 Драйверыг солих

`deploy/.env.production` дотор:

```bash
STORAGE_DRIVER=s3
S3_BUCKET=gksedu
AWS_REGION=ap-southeast-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
```

`STORAGE_LOCAL_DIR`-ыг **хэвээр үлдээнэ** — буцаж шилжих хэрэгтэй болбол тэр
файлууд байрандаа байх ёстой.

> Серверийн `.env`-ийг гараар засаж болохгүй: дараагийн deploy дарж бичнэ.
> Цорын ганц эх сурвалж нь `deploy/.env.production`.

### 4.4 Deploy

```bash
git status          # deploy нь ажлын мод (working tree)-ыг барьдаг, цэвэр эсэхийг шалгана
./deploy/deploy.sh
```

### 4.5 Баталгаажуулах

1. gksedu.mn → админ → нэг хэргийн бичиг баримт нээж татаж үзнэ
2. Шинээр нэг файл байршуулж, S3 console дээр объект үүссэнийг харна
3. Серверийн лог: `./deploy/logs.sh` дээр `S3StorageDriver` алдаа байх ёсгүй

Хэд хоног ажиллаж, бүх зүйл хэвийн болсны дараа серверийн хоёр хуучин хавтсыг
устгаж болно. Яарах хэрэггүй — 23MB нь юу ч биш.

---

## 5. Буцаж шилжих (rollback)

`deploy/.env.production` дотор `STORAGE_DRIVER=local` болгоод дахин deploy хийнэ.
Локал файлууд арилаагүй тул хуучин байдалдаа шууд эргэнэ. S3 руу нэмэгдсэн шинэ
файлууд л дутна — тиймээс rollback хийвэл тэр хугацаанд орсон файлуудыг гараар
буулгах хэрэгтэй болно.

---

## 6. Өртөг

23MB, сард хэдэн зуун татах хүсэлт гэвэл S3-ийн төлбөр сард **$0.01-аас**
доогуур гарна. Versioning нь хуучин хувилбаруудыг хадгална, гэхдээ хэмжээ ийм
байхад мэдэгдэхгүй. Хэрэв ирээдүйд өснө гэвэл `deleted/` угтвар дээр 90 хоногийн
дараа Glacier руу шилжүүлэх lifecycle дүрэм нэмж болно — одоо шаардлагагүй.

---

## 7. Тохиргооны хувьсагчид

| Хувьсагч | Утга |
|---|---|
| `STORAGE_DRIVER` | `local` \| `s3` \| `supabase`. Танигдахгүй утга boot дээр унана |
| `S3_BUCKET` | `s3` үед заавал. Дутуу бол boot дээр унана |
| `AWS_REGION` | Анхдагч `ap-southeast-1` |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Хоёулаа хоосон бол SDK-ийн анхдагч гинжийг (EC2 instance role, `~/.aws`) ашиглана |
| `S3_ENDPOINT` | Зөвхөн S3-тэй нийцтэй сангуудад (MinIO, R2). Жинхэнэ AWS дээр хоосон |
| `STORAGE_LOCAL_DIR` | `local` драйверын үндэс. Үнэмлэхүй зам одоо яг тэр замыг заана |
