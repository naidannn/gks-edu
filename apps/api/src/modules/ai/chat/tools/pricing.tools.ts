import { Injectable, NotFoundException } from '@nestjs/common';
import { toNumber, type DecimalLike } from '../../../../common/utils/decimal.js';
import { AccessLevel, BalanceTrigger, PrepaymentMode, ServiceType } from '../../../../prisma/client.js';
import { FxService } from '../../../fx/fx.service.js';
import { PricingService } from '../../../pricing/pricing.service.js';
import { requireEnum } from './args.js';
import type { AiTool, AiToolProvider, ToolOutcome } from './tool.types.js';

const SERVICE_TYPES = Object.values(ServiceType);

/** When the rest of the fee falls due, in the words a client would use. */
const BALANCE_TRIGGER_MN: Record<BalanceTrigger, string> = {
  [BalanceTrigger.AFTER_VISA_APPROVED]: 'Виз гарсны дараа',
  [BalanceTrigger.AFTER_SCHOLARSHIP_RESULT]: 'Тэтгэлгийн дүн зарлагдсаны дараа',
};

/**
 * Money: what the service costs, and what a won is worth today (§5.3).
 *
 * **`get_service_pricing` starts at `REGISTERED`, and that is a business rule
 * rather than a security one** (§15-32). Prices are published information; the
 * office's position is that a figure quoted to a stranger with no idea of their
 * situation does more harm than good, so a guest is routed to a consultation
 * and the model never sees this tool at all. The `PUBLIC` level prompt already
 * tells it to explain the shape of the payment — prepayment and balance —
 * without the numbers.
 *
 * Neither figure below is a constant. Prices are versioned rows in
 * `ServicePricing`, and the balance falls due on the visa for ordinary brokerage
 * but on the scholarship result for GKS, so the order of events is read from the
 * row rather than assumed (`gksedu.md` §9, CLAUDE.md).
 */
@Injectable()
export class PricingTools implements AiToolProvider {
  constructor(
    private readonly pricing: PricingService,
    private readonly fx: FxService,
  ) {}

  tools(): AiTool[] {
    return [this.getServicePricing(), this.getFxRate()];
  }

  private getServicePricing(): AiTool {
    return {
      name: 'get_service_pricing',
      minLevel: AccessLevel.REGISTERED,
      label: 'Үйлчилгээний үнийг шалгаж байна…',
      description:
        'Нэг үйлчилгээний одоогийн үнэ: нийт дүн, урьдчилгаа, үлдэгдэл болон үлдэгдлийг ' +
        'хэзээ төлөх болзол. Төгрөгөөр. Үнийг зөвхөн эндээс ав, санахыг бүү оролд.',
      parameters: {
        type: 'object',
        properties: {
          serviceType: { type: 'string', enum: SERVICE_TYPES, description: 'Аль үйлчилгээний үнэ' },
        },
        required: ['serviceType'],
      },
      run: async (args): Promise<ToolOutcome> => {
        const serviceType = requireEnum(args, 'serviceType', SERVICE_TYPES);

        let row: Awaited<ReturnType<PricingService['getActive']>>;
        try {
          row = await this.pricing.getActive(serviceType);
        } catch (error) {
          if (error instanceof NotFoundException) {
            return {
              title: 'Үнэ тохируулаагүй',
              data: {
                found: false,
                message: `${serviceType} үйлчилгээнд одоогоор идэвхтэй үнэ бүртгэгдээгүй. Зөвлөхөөс лавлахыг санал болго.`,
              },
            };
          }
          throw error;
        }

        const totalAmount = toNumber(row.totalAmount as DecimalLike);
        const prepaymentValue = toNumber(row.prepaymentValue as DecimalLike);
        const prepaymentAmount =
          row.prepaymentMode === PrepaymentMode.PERCENT
            ? Math.round((totalAmount * prepaymentValue) / 100)
            : prepaymentValue;
        const balanceAmount = Math.max(0, totalAmount - prepaymentAmount);

        return {
          title: `Үйлчилгээний үнэ — ${serviceType}`,
          data: {
            үйлчилгээ: serviceType,
            нийт_төгрөг: totalAmount,
            урьдчилгаа_төгрөг: prepaymentAmount,
            үлдэгдэл_төгрөг: balanceAmount,
            үлдэгдлийг_хэзээ: BALANCE_TRIGGER_MN[row.balanceTrigger],
            урьдчилгаа_төлөх_хоног: row.prepaymentDueDays,
            үлдэгдэл_төлөх_хоног: row.balanceDueDays,
          },
          card: {
            type: 'pricing',
            data: {
              serviceType,
              totalAmount,
              prepaymentAmount,
              balanceAmount,
              balanceTrigger: row.balanceTrigger,
            },
          },
        };
      },
    };
  }

  private getFxRate(): AiTool {
    return {
      name: 'get_fx_rate',
      minLevel: AccessLevel.PUBLIC,
      label: 'Ханш шалгаж байна…',
      description:
        'Өнөөдрийн вон/төгрөгийн ханш. Солонгосын үнийг төгрөг рүү хөрвүүлэхээр бол ' +
        'эхлээд үүнийг дуудаж, өөрөө ханш бүү сана.',
      parameters: { type: 'object', properties: {} },
      run: async (): Promise<ToolOutcome> => {
        const { rate, date, source } = await this.fx.current();
        const isoDate = date instanceof Date ? date.toISOString() : String(date);

        return {
          title: 'Вон/төгрөгийн ханш',
          data: {
            нэг_вон_төгрөгөөр: rate,
            огноо: isoDate.slice(0, 10),
            эх_сурвалж: source,
          },
          card: { type: 'fx', data: { rate, date: isoDate, source } },
        };
      },
    };
  }
}
