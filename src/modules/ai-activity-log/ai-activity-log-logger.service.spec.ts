import { describe, expect, it, jest } from '@jest/globals';
import { Prisma } from '@prisma/client';

import { AiActivityLoggerService } from './ai-activity-log-logger.service';
import { PrismaService } from '../../database/prisma/prisma.service';

function buildPrismaMock() {
  const create = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const prisma = { aiActivityLog: { create } } as unknown as PrismaService;
  return { prisma, create };
}

describe('AiActivityLoggerService.logCall', () => {
  it('never throws, even when the Prisma write itself fails', async () => {
    const { prisma, create } = buildPrismaMock();
    create.mockRejectedValue(new Error('DB unreachable'));
    const service = new AiActivityLoggerService(prisma);

    await expect(
      service.logCall({
        functionType: 'PARSE_RESUME',
        context: { tier: 'ENTERPRISE' },
        input: { a: 1 },
        latencyMs: 100,
      }),
    ).resolves.toBeUndefined();
  });

  it('records status SUCCESS when no errorMessage is given, FAILED when one is', async () => {
    const { prisma, create } = buildPrismaMock();
    const service = new AiActivityLoggerService(prisma);

    await service.logCall({
      functionType: 'PARSE_RESUME',
      context: { tier: 'ENTERPRISE' },
      input: {},
      latencyMs: 50,
    });
    await service.logCall({
      functionType: 'PARSE_RESUME',
      context: { tier: 'ENTERPRISE' },
      input: {},
      latencyMs: 50,
      errorMessage: 'AI service timeout',
    });

    expect(create).toHaveBeenNthCalledWith(1, expect.objectContaining({ data: expect.objectContaining({ status: 'SUCCESS' }) }));
    expect(create).toHaveBeenNthCalledWith(2, expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }));
  });

  it('writes Prisma.JsonNull for output when output is omitted', async () => {
    const { prisma, create } = buildPrismaMock();
    const service = new AiActivityLoggerService(prisma);

    await service.logCall({
      functionType: 'PARSE_RESUME',
      context: { tier: 'ENTERPRISE' },
      input: {},
      latencyMs: 50,
      errorMessage: 'failed before producing output',
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ output: Prisma.JsonNull }) }),
    );
  });

  it('leaves input/output untouched for the ENTERPRISE tier', async () => {
    const { prisma, create } = buildPrismaMock();
    const service = new AiActivityLoggerService(prisma);
    const input = { personal: { email: 'jane@example.com', full_name: 'Jane Doe' } };

    await service.logCall({
      functionType: 'PARSE_RESUME',
      context: { tier: 'ENTERPRISE' },
      input,
      output: { raw_text: 'contact me at jane@example.com' },
      latencyMs: 50,
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          input: { personal: { email: 'jane@example.com', full_name: 'Jane Doe' } },
          output: { raw_text: 'contact me at jane@example.com' },
        }),
      }),
    );
  });

  it('redacts contact info and personal blocks anywhere in the payload for the PUBLIC tier', async () => {
    const { prisma, create } = buildPrismaMock();
    const service = new AiActivityLoggerService(prisma);
    const input = { personal: { email: 'jane@example.com', full_name: 'Jane Doe', phone: '0901234567' } };

    await service.logCall({
      functionType: 'PARSE_RESUME',
      context: { tier: 'PUBLIC' },
      input,
      output: { raw_text: 'reach out at jane@example.com or 0901234567' },
      latencyMs: 50,
    });

    const call = create.mock.calls[0][0] as { data: { input: unknown; output: unknown } };
    expect(call.data.input).toEqual(
      expect.objectContaining({
        personal: expect.objectContaining({ email: '[REDACTED]', full_name: '[REDACTED]' }),
      }),
    );
    expect(call.data.output).toEqual({ raw_text: expect.stringContaining('[REDACTED') });
  });
});
