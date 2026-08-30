import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button, EmptyState, SkeletonList, StatusPill } from '../components/ui';
import { DASHBOARD_MODULES } from '../config/modules';
import { useAsyncData } from '../hooks/useAsyncData';
import { dashboardApi } from '../lib/api';
import { formatWhen, titleCase } from '../lib/format';

function eventLabel(eventType: string) {
  return titleCase(eventType.replace(/[.:]/g, '_'));
}

export function DashboardPage() {
  const { user, hasAnyPermission, hasPermission } = useAuth();

  const { data, loading, error, reload } = useAsyncData(
    useCallback(async () => {
      const response = await dashboardApi.overview();
      return response.data ?? null;
    }, []),
    [],
  );

  const shortcuts = DASHBOARD_MODULES.filter(
    (module) =>
      module.id !== 'dashboard' && hasAnyPermission(module.permissions),
  );

  const stats = data?.stats;

  return (
    <section className="page">
      <header className="page-header live-header">
        <div>
          <p className="eyebrow">Welcome back</p>
          <h1>Hello, {user?.firstName}</h1>
          <p className="lede">
            Signed in as <strong>{user?.role}</strong>. Here is what needs your
            attention today.
          </p>
        </div>
        {hasPermission('Interview.Create') ? (
          <Link className="primary-btn" to="/interviews">
            Schedule interview
          </Link>
        ) : null}
      </header>

      {error ? (
        <div className="alert" role="alert">
          {error}
          <Button variant="link" onClick={reload}>
            Retry
          </Button>
        </div>
      ) : null}

      {loading ? (
        <SkeletonList rows={3} />
      ) : (
        <>
          {stats ? (
            <div className="stat-grid">
              <div className="stat-card accent">
                <span>Today</span>
                <strong>{stats.today}</strong>
              </div>
              <div className="stat-card">
                <span>Upcoming</span>
                <strong>{stats.upcoming}</strong>
              </div>
              <div className="stat-card info">
                <span>Done this week</span>
                <strong>{stats.completedThisWeek}</strong>
              </div>
              <div className="stat-card warning">
                <span>Awaiting review</span>
                <strong>{stats.pendingReviews}</strong>
              </div>
              <div className="stat-card">
                <span>Candidates</span>
                <strong>{stats.candidates}</strong>
              </div>
              <div className="stat-card">
                <span>Questions</span>
                <strong>{stats.questions}</strong>
              </div>
            </div>
          ) : null}

          <div className="dash-grid">
            <div className="dash-main">
              <h2 className="section-title">Up next</h2>
              {data && data.upcoming.length > 0 ? (
                <div className="session-list">
                  {data.upcoming.map((row) => (
                    <article key={row.id} className="session-card">
                      <div>
                        <div className="session-top">
                          <h3>{row.title}</h3>
                          <StatusPill status={row.status}>
                            {titleCase(row.status)}
                          </StatusPill>
                          {row.windowOpen ? (
                            <StatusPill status="IN_PROGRESS">
                              Open now
                            </StatusPill>
                          ) : null}
                        </div>
                        <p className="meta">
                          {row.candidateName} · {formatWhen(row.scheduledAt)} ·{' '}
                          {row.interviewerName}
                        </p>
                      </div>
                      <div className="session-actions">
                        {row.liveInterviewId ? (
                          <Link
                            className="ghost-btn"
                            to={`/live-interview/${row.liveInterviewId}/lobby`}
                          >
                            Open room
                          </Link>
                        ) : null}
                        {row.technicalInterviewId ? (
                          <Link
                            className="ghost-btn"
                            to={`/technical-interview/${row.technicalInterviewId}/review`}
                          >
                            Assessment
                          </Link>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="Nothing scheduled"
                  description="When an interview is booked it shows up here with a direct link into the room."
                />
              )}

              <h2 className="section-title">Recently completed</h2>
              {data && data.recent.length > 0 ? (
                <ul className="history-list">
                  {data.recent.map((row) => (
                    <li key={row.id}>
                      <div>
                        <strong>{row.title}</strong>
                        <span className="meta">
                          {row.candidateName} · {formatWhen(row.scheduledAt)}
                        </span>
                      </div>
                      <div className="history-actions">
                        {row.rating != null ? (
                          <StatusPill status="COMPLETED">
                            {row.rating}/5
                          </StatusPill>
                        ) : (
                          <StatusPill status="NOT_STARTED">
                            No feedback
                          </StatusPill>
                        )}
                        {row.liveInterviewId ? (
                          <Link
                            className="link-btn"
                            to={`/live-interview/${row.liveInterviewId}/review`}
                          >
                            Review
                          </Link>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="lede">No completed interviews yet.</p>
              )}
            </div>

            <aside className="dash-side">
              <div className="side-card">
                <h2>Quick links</h2>
                <div className="shortcut-list">
                  {shortcuts.map((module) => (
                    <Link
                      key={module.id}
                      to={module.path}
                      className="shortcut"
                    >
                      <strong>{module.label}</strong>
                      <span>{module.description}</span>
                    </Link>
                  ))}
                </div>
              </div>

              <div className="side-card">
                <h2>Recent activity</h2>
                {data && data.activity.length > 0 ? (
                  <ul className="activity-list">
                    {data.activity.map((event) => (
                      <li key={event.id}>
                        <span className="activity-dot" aria-hidden="true" />
                        <div>
                          <strong>{eventLabel(event.eventType)}</strong>
                          <span className="meta">
                            {event.interviewTitle} · {event.actorName} ·{' '}
                            {formatWhen(event.createdAt)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="meta">
                    Room joins, recordings, and completions will appear here.
                  </p>
                )}
              </div>
            </aside>
          </div>
        </>
      )}
    </section>
  );
}
