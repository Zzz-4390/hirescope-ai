import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  InterviewDifficulty,
  InterviewStatus,
  PrismaClient,
  ProjectStatus,
  TaskStatus,
  TaskType,
} from '@prisma/client';

const prisma = new PrismaClient();

describe('database constraints', () => {
  const userId = randomUUID();
  const projectId = randomUUID();
  const otherUserId = randomUUID();
  const otherProjectId = randomUUID();

  beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: userId,
        username: `db_${userId.replaceAll('-', '')}`.slice(0, 30),
        email: `db-${userId}@example.com`,
        passwordHash: 'test-only-hash',
      },
    });
    await prisma.project.create({
      data: {
        id: projectId,
        userId,
        name: 'Constraint fixture',
        originalFileName: 'fixture.zip',
        zipStoragePath: `/tmp/${projectId}.zip`,
        fileSize: 100n,
        fileHash: 'a'.repeat(64),
        status: ProjectStatus.UPLOADED,
      },
    });
    await prisma.user.create({
      data: {
        id: otherUserId,
        username: `db_${otherUserId.replaceAll('-', '')}`.slice(0, 30),
        email: `db-${otherUserId}@example.com`,
        passwordHash: 'test-only-hash',
      },
    });
    await prisma.project.create({
      data: {
        id: otherProjectId,
        userId: otherUserId,
        name: 'Other user constraint fixture',
        originalFileName: 'other-fixture.zip',
        fileSize: 100n,
        fileHash: 'b'.repeat(64),
        status: ProjectStatus.UPLOADED,
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await prisma.$disconnect();
  });

  it('accepts valid base data', async () => {
    await expect(prisma.project.findUnique({ where: { id: projectId } })).resolves.toMatchObject({
      id: projectId,
      userId,
    });
  });

  it('rejects non-normalized email', async () => {
    await expect(
      prisma.user.create({
        data: {
          username: `db_${randomUUID().replaceAll('-', '')}`.slice(0, 30),
          email: ` UPPER-${randomUUID()}@EXAMPLE.COM `,
          passwordHash: 'test-only-hash',
        },
      }),
    ).rejects.toThrow();
  });

  it.each(['UPPER_NAME', 'bad-name', 'ab'])('rejects invalid username %s', async (username) => {
    await expect(
      prisma.user.create({
        data: {
          username,
          email: `db-${randomUUID()}@example.com`,
          passwordHash: 'test-only-hash',
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects duplicate usernames', async () => {
    const username = `db_${randomUUID().replaceAll('-', '')}`.slice(0, 30);
    await prisma.user.create({
      data: { username, email: `db-${randomUUID()}@example.com`, passwordHash: 'test-only-hash' },
    });
    await expect(
      prisma.user.create({
        data: { username, email: `db-${randomUUID()}@example.com`, passwordHash: 'test-only-hash' },
      }),
    ).rejects.toThrow();
  });

  it('rejects an invalid code review score', async () => {
    await expect(
      prisma.codeReview.create({
        data: { projectId, userId, status: TaskStatus.SUCCEEDED, score: 101 },
      }),
    ).rejects.toThrow();
  });

  it('rejects invalid interview question counts', async () => {
    await expect(
      prisma.interview.create({
        data: {
          projectId,
          userId,
          title: 'Invalid interview',
          status: InterviewStatus.READY,
          difficulty: InterviewDifficulty.MEDIUM,
          questionCount: 4,
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects an interview current index beyond its question count', async () => {
    await expect(
      prisma.interview.create({
        data: {
          projectId,
          userId,
          title: 'Invalid progress interview',
          status: InterviewStatus.IN_PROGRESS,
          difficulty: InterviewDifficulty.MEDIUM,
          questionCount: 5,
          currentIndex: 6,
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects a non-positive interview question sequence', async () => {
    const interview = await prisma.interview.create({
      data: {
        projectId,
        userId,
        title: 'Question sequence fixture',
        status: InterviewStatus.READY,
        difficulty: InterviewDifficulty.MEDIUM,
        questionCount: 5,
      },
    });

    await expect(
      prisma.interviewQuestion.create({
        data: {
          interviewId: interview.id,
          sequence: 0,
          category: 'database',
          difficulty: InterviewDifficulty.MEDIUM,
          question: 'Explain database constraints.',
          referencePoints: [],
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects an invalid interview report score', async () => {
    const interview = await prisma.interview.create({
      data: {
        projectId,
        userId,
        title: 'Report score fixture',
        status: InterviewStatus.COMPLETED,
        difficulty: InterviewDifficulty.MEDIUM,
        questionCount: 5,
      },
    });

    await expect(
      prisma.interviewReport.create({
        data: {
          interviewId: interview.id,
          userId,
          overallScore: -1,
          summary: 'Invalid score fixture',
          dimensions: {},
          questionReviews: [],
          strengths: [],
          improvements: [],
          result: {},
          model: 'test-only-model',
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects an invalid async task progress', async () => {
    await expect(
      prisma.asyncTask.create({
        data: {
          userId,
          projectId,
          type: TaskType.PROJECT_ANALYSIS,
          status: TaskStatus.SUCCEEDED,
          progress: 101,
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects negative async task attempts', async () => {
    await expect(
      prisma.asyncTask.create({
        data: {
          userId,
          projectId,
          type: TaskType.PROJECT_ANALYSIS,
          status: TaskStatus.SUCCEEDED,
          attempts: -1,
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects a negative AI call retry count', async () => {
    await expect(
      prisma.aiCallLog.create({
        data: {
          userId,
          projectId,
          scene: 'constraint-test',
          provider: 'test-only-provider',
          model: 'test-only-model',
          status: 'FAILED',
          retryCount: -1,
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects a task without required business relation', async () => {
    await expect(
      prisma.asyncTask.create({
        data: { userId, type: TaskType.CODE_REVIEW, status: TaskStatus.PENDING },
      }),
    ).rejects.toThrow();
  });

  it('rejects a code review that references another user project', async () => {
    await expect(
      prisma.codeReview.create({
        data: {
          projectId: otherProjectId,
          userId,
          status: TaskStatus.PENDING,
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects an interview that references another user project', async () => {
    await expect(
      prisma.interview.create({
        data: {
          projectId: otherProjectId,
          userId,
          title: 'Cross-user interview',
          status: InterviewStatus.READY,
          difficulty: InterviewDifficulty.MEDIUM,
          questionCount: 5,
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects an answer whose question belongs to another interview', async () => {
    const questionInterview = await prisma.interview.create({
      data: {
        projectId,
        userId,
        title: 'Question owner interview',
        status: InterviewStatus.IN_PROGRESS,
        difficulty: InterviewDifficulty.MEDIUM,
        questionCount: 5,
      },
    });
    const answerInterview = await prisma.interview.create({
      data: {
        projectId,
        userId,
        title: 'Answer target interview',
        status: InterviewStatus.IN_PROGRESS,
        difficulty: InterviewDifficulty.MEDIUM,
        questionCount: 5,
      },
    });
    const question = await prisma.interviewQuestion.create({
      data: {
        interviewId: questionInterview.id,
        sequence: 1,
        category: 'database',
        difficulty: InterviewDifficulty.MEDIUM,
        question: 'Explain composite foreign keys.',
        referencePoints: [],
      },
    });

    await expect(
      prisma.interviewAnswer.create({
        data: {
          questionId: question.id,
          interviewId: answerInterview.id,
          userId,
          content: 'Cross-interview answer',
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects an answer whose user does not own the interview', async () => {
    const interview = await prisma.interview.create({
      data: {
        projectId: otherProjectId,
        userId: otherUserId,
        title: 'Other user interview',
        status: InterviewStatus.IN_PROGRESS,
        difficulty: InterviewDifficulty.MEDIUM,
        questionCount: 5,
      },
    });
    const question = await prisma.interviewQuestion.create({
      data: {
        interviewId: interview.id,
        sequence: 1,
        category: 'database',
        difficulty: InterviewDifficulty.MEDIUM,
        question: 'Explain tenant ownership.',
        referencePoints: [],
      },
    });

    await expect(
      prisma.interviewAnswer.create({
        data: {
          questionId: question.id,
          interviewId: interview.id,
          userId,
          content: 'Cross-user answer',
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects a report whose user does not own the interview', async () => {
    const interview = await prisma.interview.create({
      data: {
        projectId: otherProjectId,
        userId: otherUserId,
        title: 'Other user report interview',
        status: InterviewStatus.COMPLETED,
        difficulty: InterviewDifficulty.MEDIUM,
        questionCount: 5,
      },
    });

    await expect(
      prisma.interviewReport.create({
        data: {
          interviewId: interview.id,
          userId,
          overallScore: 80,
          summary: 'Cross-user report',
          dimensions: {},
          questionReviews: [],
          strengths: [],
          improvements: [],
          result: {},
          model: 'test-only-model',
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects a task that binds another user project', async () => {
    await expect(
      prisma.asyncTask.create({
        data: {
          userId,
          projectId: otherProjectId,
          type: TaskType.PROJECT_ANALYSIS,
          status: TaskStatus.SUCCEEDED,
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects a task whose code review belongs to another project', async () => {
    const secondProject = await prisma.project.create({
      data: {
        userId,
        name: 'Task project mismatch fixture',
        originalFileName: 'task-project.zip',
        fileSize: 100n,
        fileHash: 'c'.repeat(64),
        status: ProjectStatus.COMPLETED,
      },
    });
    const codeReview = await prisma.codeReview.create({
      data: { projectId, userId, status: TaskStatus.PENDING },
    });

    await expect(
      prisma.asyncTask.create({
        data: {
          userId,
          projectId: secondProject.id,
          codeReviewId: codeReview.id,
          type: TaskType.CODE_REVIEW,
          status: TaskStatus.SUCCEEDED,
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects a task whose interview belongs to another project', async () => {
    const secondProject = await prisma.project.create({
      data: {
        userId,
        name: 'Interview task mismatch fixture',
        originalFileName: 'interview-task.zip',
        fileSize: 100n,
        fileHash: 'd'.repeat(64),
        status: ProjectStatus.COMPLETED,
      },
    });
    const interview = await prisma.interview.create({
      data: {
        projectId,
        userId,
        title: 'Task interview fixture',
        status: InterviewStatus.READY,
        difficulty: InterviewDifficulty.MEDIUM,
        questionCount: 5,
      },
    });

    await expect(
      prisma.asyncTask.create({
        data: {
          userId,
          projectId: secondProject.id,
          interviewId: interview.id,
          type: TaskType.INTERVIEW_QUESTION_GENERATION,
          status: TaskStatus.SUCCEEDED,
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects duplicate active project analysis tasks', async () => {
    await prisma.asyncTask.create({
      data: { userId, projectId, type: TaskType.PROJECT_ANALYSIS, status: TaskStatus.PENDING },
    });

    await expect(
      prisma.asyncTask.create({
        data: { userId, projectId, type: TaskType.PROJECT_ANALYSIS, status: TaskStatus.QUEUED },
      }),
    ).rejects.toThrow();
  });

  it('allows a new task after the previous task reaches a terminal state', async () => {
    await prisma.asyncTask.updateMany({
      where: { projectId, type: TaskType.PROJECT_ANALYSIS },
      data: { status: TaskStatus.SUCCEEDED },
    });

    await expect(
      prisma.asyncTask.create({
        data: { userId, projectId, type: TaskType.PROJECT_ANALYSIS, status: TaskStatus.PENDING },
      }),
    ).resolves.toMatchObject({ projectId, status: TaskStatus.PENDING });
  });

  it('rejects duplicate bull job ids', async () => {
    const bullJobId = randomUUID();
    await prisma.asyncTask.updateMany({
      where: { projectId, type: TaskType.PROJECT_ANALYSIS },
      data: { status: TaskStatus.SUCCEEDED },
    });
    await prisma.asyncTask.create({
      data: {
        userId,
        projectId,
        type: TaskType.PROJECT_ANALYSIS,
        status: TaskStatus.SUCCEEDED,
        bullJobId,
      },
    });

    await expect(
      prisma.asyncTask.create({
        data: {
          userId,
          projectId,
          type: TaskType.PROJECT_ANALYSIS,
          status: TaskStatus.SUCCEEDED,
          bullJobId,
        },
      }),
    ).rejects.toThrow();
  });

  it.each([
    TaskType.CODE_REVIEW,
    TaskType.INTERVIEW_QUESTION_GENERATION,
    TaskType.INTERVIEW_REPORT_GENERATION,
    TaskType.PROJECT_CLEANUP,
  ])('rejects duplicate active %s tasks', async (type) => {
    const dedicatedProject = await prisma.project.create({
      data: {
        userId,
        name: `${type} fixture`,
        originalFileName: 'fixture.zip',
        fileSize: 100n,
        fileHash: randomUUID().replaceAll('-', '').padEnd(64, 'a'),
        status: ProjectStatus.COMPLETED,
      },
    });
    const firstInterview = type.startsWith('INTERVIEW_')
      ? await prisma.interview.create({
          data: {
            projectId: dedicatedProject.id,
            userId,
            title: 'Active task fixture',
            status: InterviewStatus.READY,
            difficulty: InterviewDifficulty.MEDIUM,
            questionCount: 5,
          },
        })
      : undefined;
    const secondInterview = type === TaskType.INTERVIEW_QUESTION_GENERATION
      ? await prisma.interview.create({
          data: {
            projectId: dedicatedProject.id,
            userId,
            title: 'Second active task fixture',
            status: InterviewStatus.READY,
            difficulty: InterviewDifficulty.MEDIUM,
            questionCount: 5,
          },
        })
      : firstInterview;
    const firstCodeReview = type === TaskType.CODE_REVIEW
      ? await prisma.codeReview.create({
          data: { projectId: dedicatedProject.id, userId, status: TaskStatus.PENDING },
        })
      : undefined;
    const secondCodeReview = type === TaskType.CODE_REVIEW
      ? await prisma.codeReview.create({
          data: { projectId: dedicatedProject.id, userId, status: TaskStatus.PENDING },
        })
      : undefined;

    await prisma.asyncTask.create({
      data: {
        userId,
        projectId: dedicatedProject.id,
        codeReviewId: firstCodeReview?.id,
        interviewId: firstInterview?.id,
        type,
        status: TaskStatus.PENDING,
      },
    });

    await expect(
      prisma.asyncTask.create({
        data: {
          userId,
          projectId: dedicatedProject.id,
          codeReviewId: secondCodeReview?.id,
          interviewId: secondInterview?.id,
          type,
          status: TaskStatus.PROCESSING,
        },
      }),
    ).rejects.toThrow();
  });
});
