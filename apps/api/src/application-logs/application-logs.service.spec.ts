import { Prisma } from '@prisma/client';
import { ApplicationLogsService } from './application-logs.service';

describe('ApplicationLogsService', () => {
  const requireWorkspaceRole = jest.fn();
  const resolveWorkspaceMembershipForUser = jest.fn();
  const findMany = jest.fn();
  const findFirst = jest.fn();
  const createClientLog = jest.fn();
  const deleteMany = jest.fn();

  const workspaceService = {
    requireWorkspaceRole,
    resolveWorkspaceMembershipForUser,
  };

  const repository = {
    findMany,
    findFirst,
    createClientLog,
    deleteMany,
  };

  let service: ApplicationLogsService;

  beforeEach(() => {
    jest.clearAllMocks();
    requireWorkspaceRole.mockResolvedValue({ workspaceId: 'ws_1' });
    resolveWorkspaceMembershipForUser.mockResolvedValue({ workspaceId: 'ws_1' });
    service = new ApplicationLogsService(repository as any, workspaceService as any);
  });

  it('returns an empty list when ApplicationLog storage is missing', async () => {
    findMany.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        'The table `public.ApplicationLog` does not exist in the current database.',
        {
          code: 'P2021',
          clientVersion: 'test',
        },
      ),
    );

    await expect(service.list('user_1', { limit: 25 })).resolves.toEqual({
      items: [],
      nextCursor: null,
      hasMore: false,
      filters: {
        cursor: undefined,
        limit: 25,
        dateFrom: undefined,
        dateTo: undefined,
        levels: undefined,
        kinds: undefined,
        sources: undefined,
        events: undefined,
        methods: undefined,
        endpoint: undefined,
        statusCode: undefined,
        statusCodeFrom: undefined,
        statusCodeTo: undefined,
        correlationId: undefined,
        userId: undefined,
        search: undefined,
      },
    });
  });

  it('combines endpoint, search, and cursor filters without overwriting OR clauses', async () => {
    findMany.mockResolvedValue([]);

    await service.list('user_1', {
      endpoint: '/api/application-logs',
      search: 'runtime',
      cursor: Buffer.from('2026-07-18T10:00:00.000Z::log_123').toString('base64url'),
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: expect.arrayContaining([
            { workspaceId: 'ws_1' },
            {
              OR: [
                {
                  endpoint: {
                    contains: '/api/application-logs',
                    mode: 'insensitive',
                  },
                },
                {
                  path: {
                    contains: '/api/application-logs',
                    mode: 'insensitive',
                  },
                },
              ],
            },
            {
              OR: [
                { message: { contains: 'runtime', mode: 'insensitive' } },
                { event: { contains: 'runtime', mode: 'insensitive' } },
                { source: { contains: 'runtime', mode: 'insensitive' } },
                { errorCode: { contains: 'runtime', mode: 'insensitive' } },
                { endpoint: { contains: 'runtime', mode: 'insensitive' } },
              ],
            },
            {
              OR: [
                { createdAt: { lt: new Date('2026-07-18T10:00:00.000Z') } },
                {
                  createdAt: new Date('2026-07-18T10:00:00.000Z'),
                  id: { lt: 'log_123' },
                },
              ],
            },
          ]),
        },
      }),
    );
  });

  it('clears logs for the current workspace', async () => {
    deleteMany.mockResolvedValue({ count: 17 });

    await expect(service.clearWorkspaceLogs('user_1')).resolves.toEqual({
      success: true,
      deletedCount: 17,
    });

    expect(deleteMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws_1' },
    });
  });
});
