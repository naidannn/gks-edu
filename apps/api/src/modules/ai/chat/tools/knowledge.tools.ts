import { Injectable } from '@nestjs/common';
import { AccessLevel, KnowledgeCategory } from '../../../../prisma/client.js';
import { AiConfigService } from '../../ai-config.service.js';
import { RetrievalService } from '../../knowledge/retrieval.service.js';
import { readEnum, requireString } from './args.js';
import type { AiTool, AiToolProvider, ToolOutcome } from './tool.types.js';

const CATEGORIES = Object.values(KnowledgeCategory);

/** A second search is a follow-up, not a fishing trip — three chunks is plenty. */
const LIMIT = 3;

/** How much of a chunk the model is shown. Enough to answer from, short enough
 *  that four of these do not crowd out the conversation. */
const EXCERPT_CHARS = 700;

/**
 * `search_knowledge` — the assistant asking a second question (§5.3).
 *
 * Every turn already opens with a retrieval against what the visitor typed, so
 * this tool is not how the knowledge base is read; it is how the assistant
 * recovers when the first search answered the wrong question. "Виз хэр удаж
 * гардаг вэ?" retrieves visa documents, and then the visitor's real question
 * turns out to be about the medical certificate.
 *
 * It runs at the caller's level, in SQL, exactly as the opening search does —
 * the level comes from the turn's context and is never an argument, so there is
 * no wording of a tool call that reaches a document the caller may not read
 * (`AI-ASSISTANT.md` §4.5).
 */
@Injectable()
export class KnowledgeTools implements AiToolProvider {
  constructor(
    private readonly retrieval: RetrievalService,
    private readonly aiConfig: AiConfigService,
  ) {}

  tools(): AiTool[] {
    return [this.searchKnowledge()];
  }

  private searchKnowledge(): AiTool {
    return {
      name: 'search_knowledge',
      minLevel: AccessLevel.PUBLIC,
      label: 'Мэдлэгийн сангаас хайж байна…',
      description:
        'Манай мэдлэгийн сангаас (журам, заавар, түгээмэл асуулт) нэмэлт баримт хайна. ' +
        'Эхний эх сурвалжуудад хариулт олдоогүй, эсвэл өөр сэдэв рүү шилжсэн үед дууд.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Юу хайж байгаагаа монголоор бич' },
          category: { type: 'string', enum: CATEGORIES, description: 'Хайлтыг нэг ангилалд нарийсгах' },
        },
        required: ['query'],
      },
      run: async (args, context): Promise<ToolOutcome> => {
        const query = requireString(args, 'query', 300);
        const config = await this.aiConfig.get();

        const hits = await this.retrieval.search({
          query,
          level: context.level,
          category: readEnum(args, 'category', CATEGORIES) ?? null,
          limit: LIMIT,
          minSimilarity: config.minSimilarity,
        });

        if (hits.length === 0) {
          return {
            title: 'Мэдлэгийн сангийн хайлт',
            data: {
              found: 0,
              message:
                'Энэ асуултад тохирох баримт мэдлэгийн санд алга. Дүрэм 2-ын дагуу мэдэхгүй гэдгээ хэлээд зөвлөхөд шилжүүл.',
            },
          };
        }

        return {
          title: 'Мэдлэгийн сангийн хайлт',
          data: {
            found: hits.length,
            баримтууд: hits.map((hit) => ({
              гарчиг: hit.heading ? `${hit.title} > ${hit.heading}` : hit.title,
              агуулга: hit.content.slice(0, EXCERPT_CHARS),
            })),
          },
        };
      },
    };
  }
}
