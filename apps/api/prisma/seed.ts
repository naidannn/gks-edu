import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';
import { hash } from 'bcryptjs';
import { createHash } from 'node:crypto';
import { PrismaClient, Role } from '../src/generated/prisma/client.js';

loadEnv({ path: ['.env', '../../.env'], quiet: true });

const prisma = new PrismaClient({
  // Seeding writes DDL-free data; the pooled URL is fine.
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const DIMENSIONS = Number.parseInt(process.env.EMBEDDING_DIMENSIONS ?? '1536', 10);

/** Mirrors EmbeddingService.pseudoEmbed so seeded vectors match runtime search. */
function pseudoEmbed(text: string): number[] {
  const vector = new Array<number>(DIMENSIONS).fill(0);
  let state = createHash('sha256').update(text).digest().readUInt32BE(0) || 1;

  for (let i = 0; i < DIMENSIONS; i += 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    vector[i] = (state / 0xffffffff) * 2 - 1;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / magnitude);
}

async function main(): Promise<void> {
  const password = await hash('password123', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@gks.edu' },
    update: {},
    create: { email: 'admin@gks.edu', password, name: 'Admin', role: Role.ADMIN },
  });

  await prisma.user.upsert({
    where: { email: 'student@gks.edu' },
    update: {},
    create: { email: 'student@gks.edu', password, name: 'Student', role: Role.USER },
  });

  const chunks = [
    'Eigenvalues describe how a linear transformation scales its eigenvectors.',
    'A matrix is invertible exactly when its determinant is non-zero.',
    'Gram-Schmidt turns any basis into an orthonormal one.',
  ];

  const existing = await prisma.document.findFirst({ where: { title: 'Linear algebra basics' } });
  if (!existing) {
    const document = await prisma.document.create({
      data: {
        title: 'Linear algebra basics',
        source: 'seed',
        metadata: { subject: 'math', level: 'intro' },
        authorId: admin.id,
      },
    });

    for (const [index, content] of chunks.entries()) {
      const literal = `[${pseudoEmbed(content).join(',')}]`;
      await prisma.$executeRaw`
        INSERT INTO document_chunks (id, "documentId", "chunkIndex", content, embedding, "createdAt")
        VALUES (gen_random_uuid(), ${document.id}::uuid, ${index}, ${content}, ${literal}::vector, NOW())
      `;
    }
  }

  console.log('Seed complete: admin@gks.edu / student@gks.edu (password: password123)');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
