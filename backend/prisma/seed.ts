import { PrismaClient, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const PERMISSIONS = [
  // Dashboard
  { code: 'Dashboard.View', module: 'Dashboard', action: 'View', description: 'View dashboard' },
  // Interview
  { code: 'Interview.Create', module: 'Interview', action: 'Create', description: 'Create interviews' },
  { code: 'Interview.View', module: 'Interview', action: 'View', description: 'View interviews' },
  { code: 'Interview.Edit', module: 'Interview', action: 'Edit', description: 'Edit interviews' },
  { code: 'Interview.Delete', module: 'Interview', action: 'Delete', description: 'Delete interviews' },
  { code: 'Interview.Conduct', module: 'Interview', action: 'Conduct', description: 'Conduct interviews' },
  { code: 'Interview.Feedback', module: 'Interview', action: 'Feedback', description: 'Submit feedback' },
  { code: 'Interview.Attend', module: 'Interview', action: 'Attend', description: 'Attend assigned interviews' },
  // Live Interview
  { code: 'LiveInterview.Join', module: 'LiveInterview', action: 'Join', description: 'Join live interviews' },
  { code: 'LiveInterview.Record', module: 'LiveInterview', action: 'Record', description: 'Record live interviews' },
  // Technical Interview
  { code: 'TechnicalInterview.Create', module: 'TechnicalInterview', action: 'Create', description: 'Create technical interviews' },
  { code: 'TechnicalInterview.View', module: 'TechnicalInterview', action: 'View', description: 'View technical interviews' },
  { code: 'TechnicalInterview.Take', module: 'TechnicalInterview', action: 'Take', description: 'Take technical interviews' },
  { code: 'TechnicalInterview.Review', module: 'TechnicalInterview', action: 'Review', description: 'Review technical results' },
  // Candidates
  { code: 'Candidate.Create', module: 'Candidate', action: 'Create', description: 'Create candidates' },
  { code: 'Candidate.View', module: 'Candidate', action: 'View', description: 'View candidates' },
  { code: 'Candidate.Edit', module: 'Candidate', action: 'Edit', description: 'Edit candidates' },
  { code: 'Candidate.Delete', module: 'Candidate', action: 'Delete', description: 'Delete candidates' },
  // Question Bank
  { code: 'QuestionBank.Create', module: 'QuestionBank', action: 'Create', description: 'Create questions' },
  { code: 'QuestionBank.View', module: 'QuestionBank', action: 'View', description: 'View question bank' },
  { code: 'QuestionBank.Edit', module: 'QuestionBank', action: 'Edit', description: 'Edit questions' },
  { code: 'QuestionBank.Delete', module: 'QuestionBank', action: 'Delete', description: 'Delete questions' },
  // Reports
  { code: 'Report.View', module: 'Report', action: 'View', description: 'View reports' },
  { code: 'Report.Export', module: 'Report', action: 'Export', description: 'Export reports' },
  // Users
  { code: 'User.Create', module: 'User', action: 'Create', description: 'Create users' },
  { code: 'User.View', module: 'User', action: 'View', description: 'View users' },
  { code: 'User.Edit', module: 'User', action: 'Edit', description: 'Edit users' },
  { code: 'User.Delete', module: 'User', action: 'Delete', description: 'Delete users' },
  // Settings
  { code: 'Settings.View', module: 'Settings', action: 'View', description: 'View settings' },
  { code: 'Settings.Edit', module: 'Settings', action: 'Edit', description: 'Edit settings' },
  // Company
  { code: 'Company.Manage', module: 'Company', action: 'Manage', description: 'Manage company' },
] as const;

const ROLE_PERMISSIONS: Record<string, string[] | 'ALL'> = {
  SUPER_ADMIN: 'ALL',
  COMPANY_ADMIN: 'ALL',
  HR: [
    'Dashboard.View',
    'Interview.Create',
    'Interview.View',
    'Interview.Edit',
    'Interview.Delete',
    'LiveInterview.Join',
    'TechnicalInterview.Create',
    'TechnicalInterview.View',
    'TechnicalInterview.Review',
    'Candidate.Create',
    'Candidate.View',
    'Candidate.Edit',
    'Candidate.Delete',
    'QuestionBank.Create',
    'QuestionBank.View',
    'QuestionBank.Edit',
    'QuestionBank.Delete',
    'Report.View',
    'Report.Export',
    'Settings.View',
  ],
  INTERVIEWER: [
    'Dashboard.View',
    'Interview.View',
    'Interview.Conduct',
    'Interview.Feedback',
    'LiveInterview.Join',
    'LiveInterview.Record',
    'TechnicalInterview.View',
    'Candidate.View',
    'QuestionBank.View',
  ],
  CANDIDATE: [
    'Dashboard.View',
    'Interview.View',
    'Interview.Attend',
    'LiveInterview.Join',
    'TechnicalInterview.Take',
  ],
};

async function main() {
  console.log('Seeding permissions...');
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      update: {
        module: permission.module,
        action: permission.action,
        description: permission.description,
      },
      create: permission,
    });
  }

  const allPermissions = await prisma.permission.findMany();
  const permissionByCode = new Map(allPermissions.map((p) => [p.code, p.id]));

  const roles = [
    {
      name: 'SUPER_ADMIN',
      display_name: 'Super Admin',
      description: 'Complete application access',
    },
    {
      name: 'COMPANY_ADMIN',
      display_name: 'Company Admin',
      description: 'Complete company access',
    },
    {
      name: 'HR',
      display_name: 'HR',
      description: 'Create interviews and manage candidates',
    },
    {
      name: 'INTERVIEWER',
      display_name: 'Interviewer',
      description: 'Conduct interviews and submit feedback',
    },
    {
      name: 'CANDIDATE',
      display_name: 'Candidate',
      description: 'Attend assigned interviews',
    },
  ];

  console.log('Seeding roles...');
  for (const role of roles) {
    const savedRole = await prisma.role.upsert({
      where: { name: role.name },
      update: {
        display_name: role.display_name,
        description: role.description,
        is_system: true,
      },
      create: { ...role, is_system: true },
    });

    const mapping = ROLE_PERMISSIONS[role.name];
    const codes =
      mapping === 'ALL' ? allPermissions.map((p) => p.code) : mapping;

    await prisma.rolePermission.deleteMany({ where: { role_id: savedRole.id } });

    for (const code of codes) {
      const permissionId = permissionByCode.get(code);
      if (!permissionId) continue;
      await prisma.rolePermission.create({
        data: { role_id: savedRole.id, permission_id: permissionId },
      });
    }
  }

  console.log('Seeding demo company and users...');
  const company = await prisma.company.upsert({
    where: { slug: 'acme-corp' },
    update: { name: 'Acme Corporation', is_active: true },
    create: {
      name: 'Acme Corporation',
      slug: 'acme-corp',
      is_active: true,
    },
  });

  const roleRecords = await prisma.role.findMany();
  const roleByName = new Map(roleRecords.map((r) => [r.name, r.id]));
  const passwordHash = await bcrypt.hash('Password@123', 12);

  const demoUsers = [
    {
      email: 'superadmin@platform.com',
      firstName: 'Super',
      lastName: 'Admin',
      role: 'SUPER_ADMIN',
      companyId: null as string | null,
    },
    {
      email: 'admin@acme.com',
      firstName: 'Company',
      lastName: 'Admin',
      role: 'COMPANY_ADMIN',
      companyId: company.id,
    },
    {
      email: 'hr@acme.com',
      firstName: 'Helen',
      lastName: 'HR',
      role: 'HR',
      companyId: company.id,
    },
    {
      email: 'interviewer@acme.com',
      firstName: 'Ian',
      lastName: 'Interviewer',
      role: 'INTERVIEWER',
      companyId: company.id,
    },
    {
      email: 'candidate@acme.com',
      firstName: 'Casey',
      lastName: 'Candidate',
      role: 'CANDIDATE',
      companyId: company.id,
    },
  ];

  for (const user of demoUsers) {
    const roleId = roleByName.get(user.role);
    if (!roleId) continue;

    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        first_name: user.firstName,
        last_name: user.lastName,
        password_hash: passwordHash,
        role_id: roleId,
        company_id: user.companyId,
        status: UserStatus.ACTIVE,
      },
      create: {
        email: user.email,
        first_name: user.firstName,
        last_name: user.lastName,
        password_hash: passwordHash,
        role_id: roleId,
        company_id: user.companyId,
        status: UserStatus.ACTIVE,
      },
    });
  }

  console.log('Seeding demo live interview...');
  const hr = await prisma.user.findUnique({ where: { email: 'hr@acme.com' } });
  const interviewer = await prisma.user.findUnique({
    where: { email: 'interviewer@acme.com' },
  });
  const candidateUser = await prisma.user.findUnique({
    where: { email: 'candidate@acme.com' },
  });

  if (hr && interviewer && candidateUser) {
    const candidate = await prisma.candidate.upsert({
      where: {
        company_id_email: {
          company_id: company.id,
          email: 'candidate@acme.com',
        },
      },
      update: {
        first_name: 'Casey',
        last_name: 'Candidate',
        user_id: candidateUser.id,
      },
      create: {
        company_id: company.id,
        email: 'candidate@acme.com',
        first_name: 'Casey',
        last_name: 'Candidate',
        user_id: candidateUser.id,
      },
    });

    const existingLive = await prisma.liveInterview.findFirst({
      where: { room_code: 'DEMOLIVE' },
    });

    if (!existingLive) {
      const interview = await prisma.interview.create({
        data: {
          company_id: company.id,
          title: 'Frontend Engineer — Live Screen',
          type: 'LIVE',
          status: 'SCHEDULED',
          scheduled_at: new Date(Date.now() + 60 * 60 * 1000),
          ends_at: new Date(Date.now() + 3 * 60 * 60 * 1000),
          duration_minutes: 45,
          candidate_id: candidate.id,
          interviewer_id: interviewer.id,
          created_by_id: hr.id,
          notes: 'Demo live interview for local testing.',
        },
      });

      await prisma.liveInterview.create({
        data: {
          interview_id: interview.id,
          room_code: 'DEMOLIVE',
          invite_token: 'demo-candidate-invite-token-share-me',
          recording_enabled: true,
          participants: {
            create: [
              {
                user_id: interviewer.id,
                role: 'INTERVIEWER',
              },
              {
                user_id: candidateUser.id,
                role: 'CANDIDATE',
              },
            ],
          },
        },
      });
    } else if (!existingLive.invite_token) {
      await prisma.liveInterview.update({
        where: { id: existingLive.id },
        data: { invite_token: 'demo-candidate-invite-token-share-me' },
      });
    }

    const questionCount = await prisma.question.count({
      where: { company_id: company.id },
    });

    if (questionCount === 0) {
      const mcq = await prisma.question.create({
        data: {
          company_id: company.id,
          title: 'React hooks purpose',
          body: 'What is the primary purpose of React hooks?',
          type: 'MCQ',
          difficulty: 'EASY',
          points: 10,
          options_json: JSON.stringify([
            { id: 'a', text: 'Replace Redux only', isCorrect: false },
            {
              id: 'b',
              text: 'Use state and lifecycle features in function components',
              isCorrect: true,
            },
            { id: 'c', text: 'Compile TypeScript', isCorrect: false },
            { id: 'd', text: 'Style components', isCorrect: false },
          ]),
          created_by_id: hr.id,
        },
      });

      const shortQ = await prisma.question.create({
        data: {
          company_id: company.id,
          title: 'REST vs GraphQL',
          body: 'In 2–3 sentences, when would you choose GraphQL over REST?',
          type: 'SHORT_ANSWER',
          difficulty: 'MEDIUM',
          points: 15,
          created_by_id: hr.id,
        },
      });

      const coding = await prisma.question.create({
        data: {
          company_id: company.id,
          title: 'Sum of array',
          body: 'Write a JavaScript function `sum(nums)` that returns the sum of all numbers in the array.',
          type: 'CODING',
          difficulty: 'EASY',
          language: 'javascript',
          points: 20,
          starter_code: 'function sum(nums) {\n  // your code\n}\n',
          created_by_id: hr.id,
        },
      });

      const existingTech = await prisma.technicalInterview.findFirst({
        where: { invite_token: 'demo-tech-invite-token-share-me' },
      });

      if (!existingTech) {
        const techInterview = await prisma.interview.create({
          data: {
            company_id: company.id,
            title: 'Frontend Engineer — Technical Assessment',
            type: 'TECHNICAL',
            status: 'SCHEDULED',
            scheduled_at: new Date(Date.now() - 10 * 60 * 1000),
            ends_at: new Date(Date.now() + 4 * 60 * 60 * 1000),
            duration_minutes: 60,
            candidate_id: candidate.id,
            interviewer_id: interviewer.id,
            created_by_id: hr.id,
            notes: 'Demo technical assessment.',
          },
        });

        await prisma.technicalInterview.create({
          data: {
            interview_id: techInterview.id,
            invite_token: 'demo-tech-invite-token-share-me',
            time_limit_minutes: 60,
            instructions:
              'Answer all questions. MCQs are auto-scored. Coding and short answers are reviewed by the interviewer.',
            max_score: 45,
            questions: {
              create: [
                { question_id: mcq.id, sort_order: 0, points: 10 },
                { question_id: shortQ.id, sort_order: 1, points: 15 },
                { question_id: coding.id, sort_order: 2, points: 20 },
              ],
            },
          },
        });
      }
    }
  }

  console.log('Seed completed.');
  console.log('Demo login: hr@acme.com / Password@123');
  console.log(
    'Demo tech invite: http://localhost:5173/tech-join/demo-tech-invite-token-share-me',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
