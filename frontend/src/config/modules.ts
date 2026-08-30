export interface NavModule {
  id: string;
  label: string;
  path: string;
  permissions: string[];
  description: string;
}

export const DASHBOARD_MODULES: NavModule[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    path: '/dashboard',
    permissions: ['Dashboard.View'],
    description: 'Overview of interviews and activity',
  },
  {
    id: 'interview',
    label: 'Interview Management',
    path: '/interviews',
    permissions: ['Interview.View', 'Interview.Create'],
    description: 'Create and manage interviews',
  },
  {
    id: 'live',
    label: 'Live Interview',
    path: '/live-interview',
    permissions: ['LiveInterview.Join'],
    description: 'Join and conduct live sessions',
  },
  {
    id: 'technical',
    label: 'Technical Interview',
    path: '/technical-interview',
    permissions: [
      'TechnicalInterview.View',
      'TechnicalInterview.Create',
      'TechnicalInterview.Take',
      'TechnicalInterview.Review',
    ],
    description: 'Timed assessments and reviews',
  },
  {
    id: 'candidates',
    label: 'Candidates',
    path: '/candidates',
    permissions: ['Candidate.View'],
    description: 'Manage candidate pipeline',
  },
  {
    id: 'questions',
    label: 'Question Bank',
    path: '/question-bank',
    permissions: ['QuestionBank.View', 'QuestionBank.Create'],
    description: 'Curate interview questions',
  },
  {
    id: 'reports',
    label: 'Reports',
    path: '/reports',
    permissions: ['Report.View'],
    description: 'Analytics and outcomes',
  },
  {
    id: 'users',
    label: 'Users',
    path: '/users',
    permissions: ['User.View'],
    description: 'Manage platform users',
  },
  {
    id: 'settings',
    label: 'Settings',
    path: '/settings',
    permissions: ['Settings.View'],
    description: 'Company and account settings',
  },
];
