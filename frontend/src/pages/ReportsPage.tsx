import { useCallback, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Button, EmptyState, SkeletonList, useToast } from '../components/ui';
import { useAsyncData } from '../hooks/useAsyncData';
import { reportApi } from '../lib/api';
import { formatDay, titleCase } from '../lib/format';

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function defaultFrom() {
  const date = new Date();
  date.setMonth(date.getMonth() - 5);
  date.setDate(1);
  return isoDay(date);
}

export function ReportsPage() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const canExport = hasPermission('Report.Export');

  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(isoDay(new Date()));
  const [exporting, setExporting] = useState(false);

  const { data, loading, error, reload } = useAsyncData(
    useCallback(async () => {
      const response = await reportApi.overview(from, to);
      return response.data ?? null;
    }, [from, to]),
    [from, to],
    { debounceMs: 250 },
  );

  const maxMonthly = useMemo(
    () => Math.max(1, ...(data?.byMonth.map((row) => row.total) ?? [1])),
    [data],
  );

  const onExport = async () => {
    setExporting(true);
    try {
      const blob = await reportApi.downloadCsv(from, to);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `interviews-${from}-to-${to}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('CSV downloaded.');
    } catch (err) {
      toast.error(
        'Export failed.',
        err instanceof Error ? err.message : undefined,
      );
    } finally {
      setExporting(false);
    }
  };

  const statusTotal = Math.max(
    1,
    data?.byStatus.reduce((sum, row) => sum + row.count, 0) ?? 1,
  );

  return (
    <section className="page live-page">
      <header className="page-header live-header">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Hiring analytics</h1>
          <p className="lede">
            Interview volume, outcomes, and interviewer activity for the
            selected date range.
          </p>
        </div>
        {canExport ? (
          <Button loading={exporting} onClick={() => void onExport()}>
            Export CSV
          </Button>
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

      <div className="filter-bar">
        <label className="inline-field">
          From
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="inline-field">
          To
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        {data ? (
          <span className="filter-count">
            {formatDay(data.range.from)} – {formatDay(data.range.to)}
          </span>
        ) : null}
      </div>

      {loading ? (
        <SkeletonList rows={3} />
      ) : !data ? (
        <EmptyState
          title="No report data"
          description="Try widening the date range."
        />
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat-card accent">
              <span>Interviews</span>
              <strong>{data.totals.interviews}</strong>
            </div>
            <div className="stat-card info">
              <span>Completed</span>
              <strong>{data.totals.completed}</strong>
            </div>
            <div className="stat-card">
              <span>Completion rate</span>
              <strong>{data.totals.completionRate}%</strong>
            </div>
            <div className="stat-card danger">
              <span>Cancelled</span>
              <strong>{data.totals.cancelled}</strong>
            </div>
            <div className="stat-card">
              <span>Avg rating</span>
              <strong>{data.totals.avgRating ?? '—'}</strong>
            </div>
            <div className="stat-card">
              <span>Avg length</span>
              <strong>{data.totals.avgDurationMinutes}m</strong>
            </div>
          </div>

          <div className="report-grid">
            <section className="side-card span-2">
              <h2>Interviews per month</h2>
              {data.byMonth.every((row) => row.total === 0) ? (
                <p className="meta">No interviews in this range.</p>
              ) : (
                <div className="bar-chart">
                  {data.byMonth.map((row) => (
                    <div key={row.month} className="bar-col">
                      <div className="bar-stack">
                        <div
                          className="bar total"
                          style={{
                            height: `${(row.total / maxMonthly) * 100}%`,
                          }}
                          title={`${row.total} scheduled`}
                        />
                        <div
                          className="bar completed"
                          style={{
                            height: `${(row.completed / maxMonthly) * 100}%`,
                          }}
                          title={`${row.completed} completed`}
                        />
                      </div>
                      <span className="bar-label">{row.label}</span>
                      <span className="bar-value">{row.total}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="legend">
                <span>
                  <i className="swatch total" /> Scheduled
                </span>
                <span>
                  <i className="swatch completed" /> Completed
                </span>
              </div>
            </section>

            <section className="side-card">
              <h2>By status</h2>
              <ul className="meter-list">
                {data.byStatus.map((row) => (
                  <li key={row.status}>
                    <div className="meter-head">
                      <span>{titleCase(row.status)}</span>
                      <strong>{row.count}</strong>
                    </div>
                    <div className="meter-track">
                      <div
                        className={`meter-fill ${row.status.toLowerCase()}`}
                        style={{
                          width: `${(row.count / statusTotal) * 100}%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="side-card">
              <h2>By type</h2>
              <ul className="meter-list">
                {data.byType.map((row) => (
                  <li key={row.type}>
                    <div className="meter-head">
                      <span>{titleCase(row.type)}</span>
                      <strong>{row.count}</strong>
                    </div>
                    <div className="meter-track">
                      <div
                        className="meter-fill"
                        style={{
                          width: `${(row.count / statusTotal) * 100}%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="side-card">
              <h2>Recommendations</h2>
              {data.totals.feedbackCount === 0 ? (
                <p className="meta">No feedback submitted in this range.</p>
              ) : (
                <ul className="meter-list">
                  {data.recommendations.map((row) => (
                    <li key={row.recommendation}>
                      <div className="meter-head">
                        <span>{titleCase(row.recommendation)}</span>
                        <strong>{row.count}</strong>
                      </div>
                      <div className="meter-track">
                        <div
                          className={`meter-fill rec-${row.recommendation.toLowerCase()}`}
                          style={{
                            width: `${
                              (row.count / data.totals.feedbackCount) * 100
                            }%`,
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="side-card">
              <h2>Technical assessments</h2>
              <div className="stat-row column">
                <span>
                  <strong>{data.technical.total}</strong> assigned
                </span>
                <span>
                  <strong>{data.technical.submitted}</strong> submitted
                </span>
                <span>
                  <strong>{data.technical.notStarted}</strong> not started
                </span>
                <span>
                  <strong>{data.technical.expired}</strong> expired
                </span>
                <span>
                  Average score:{' '}
                  <strong>
                    {data.technical.avgScorePct != null
                      ? `${data.technical.avgScorePct}%`
                      : '—'}
                  </strong>
                </span>
              </div>
            </section>

            <section className="side-card span-2">
              <h2>Interviewer activity</h2>
              {data.interviewers.length === 0 ? (
                <p className="meta">No interviews in this range.</p>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Interviewer</th>
                      <th>Assigned</th>
                      <th>Completed</th>
                      <th>Avg rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.interviewers.map((row) => (
                      <tr key={row.id}>
                        <td>{row.name}</td>
                        <td>{row.total}</td>
                        <td>{row.completed}</td>
                        <td>{row.avgRating ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        </>
      )}
    </section>
  );
}
