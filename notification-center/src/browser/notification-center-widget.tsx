import * as React from '@theia/core/shared/react';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import {
    NotificationAction,
    NotificationRecord,
    NotificationSeverity
} from '../common/notification-protocol';
import { NotificationCenterFrontendService } from './notification-center-frontend-service';
import {
    groupNotificationsByDate,
    millisecondsUntilNextLocalDay,
    NotificationDateGroup
} from './notification-date-groups';

export const NOTIFICATION_CENTER_WIDGET_ID = 'notification-center';
export const NOTIFICATION_CENTER_WIDGET_LABEL = 'Notification Center';

@injectable()
export class NotificationCenterWidget extends ReactWidget {

    static readonly ID = NOTIFICATION_CENTER_WIDGET_ID;
    static readonly LABEL = NOTIFICATION_CENTER_WIDGET_LABEL;

    protected readonly enabledSeverities = new Set<NotificationSeverity>([
        'info',
        'warning',
        'error'
    ]);
    protected expandedIds = new Set<string>();
    protected midnightRefreshTimeout: number | undefined;

    constructor(
        @inject(NotificationCenterFrontendService)
        protected readonly notifications: NotificationCenterFrontendService
    ) {
        super();
    }

    @postConstruct()
    protected init(): void {
        this.id = NotificationCenterWidget.ID;
        this.title.label = NotificationCenterWidget.LABEL;
        this.title.caption = NotificationCenterWidget.LABEL;
        this.title.iconClass = 'codicon codicon-bell';
        this.title.closable = true;
        this.addClass('theia-notification-center');

        this.toDispose.push(this.notifications.onDidChange(() => {
            const knownIds = new Set(this.notifications.history.map(record => record.id));
            this.expandedIds = new Set(
                Array.from(this.expandedIds).filter(id => knownIds.has(id))
            );
            this.update();
        }));
        this.toDispose.push({
            dispose: () => this.clearMidnightRefresh()
        });
        this.scheduleMidnightRefresh();
        this.update();
    }

    protected render(): React.ReactNode {
        const records = this.notifications.history.filter(record =>
            this.enabledSeverities.has(record.severity)
        );
        const groups = groupNotificationsByDate(records);

        return <div className='notification-center-content'>
            <div className='notification-center-toolbar' role='toolbar' aria-label='Notification filters'>
                {this.renderFilter('info', 'Info')}
                {this.renderFilter('warning', 'Warning')}
                {this.renderFilter('error', 'Error')}
                <button
                    type='button'
                    className='theia-button secondary notification-center-clear'
                    disabled={this.notifications.history.length === 0}
                    onClick={this.clearAll}
                >
                    Clear All
                </button>
            </div>
            <div className='notification-center-list' aria-label='Notification history'>
                {records.length === 0
                    ? <div className='notification-center-empty'>No notifications match the selected filters.</div>
                    : groups.map(group => this.renderGroup(group))}
            </div>
        </div>;
    }

    protected renderGroup(group: NotificationDateGroup): React.ReactNode {
        const headingId = `${NotificationCenterWidget.ID}-${group.id}-heading`;
        return <section
            key={group.id}
            className='notification-center-group'
            role='group'
            aria-labelledby={headingId}
            data-date-group={group.id}
        >
            <h3 id={headingId} className='notification-center-group-title'>{group.label}</h3>
            <div className='notification-center-group-list' role='list'>
                {group.records.map(record => this.renderNotification(record))}
            </div>
        </section>;
    }

    protected renderFilter(severity: NotificationSeverity, label: string): React.ReactNode {
        return <label className={`notification-center-filter notification-center-${severity}`}>
            <input
                type='checkbox'
                data-severity={severity}
                checked={this.enabledSeverities.has(severity)}
                onChange={this.toggleFilter}
            />
            <span>{label}</span>
        </label>;
    }

    protected renderNotification(record: NotificationRecord): React.ReactNode {
        const hasActions = (record.actions?.length ?? 0) > 0;
        const expanded = hasActions && this.expandedIds.has(record.id);
        const icon = record.severity === 'warning'
            ? 'warning'
            : record.severity === 'error' ? 'error' : 'info';

        return <div
            key={record.id}
            role='listitem'
            className={`notification-center-entry notification-center-${record.severity}${hasActions ? ' actionable' : ''}`}
            data-notification-id={record.id}
            onClick={hasActions ? this.toggleActions : undefined}
            aria-expanded={hasActions ? expanded : undefined}
        >
            <span
                className={`codicon codicon-${icon} notification-center-severity-icon`}
                title={record.severity}
                aria-label={record.severity}
            />
            <div className='notification-center-entry-body'>
                <div className='notification-center-entry-header'>
                    <strong className='notification-center-title'>{record.title}</strong>
                    <time dateTime={new Date(record.createdAt).toISOString()}>
                        {this.formatTime(record.createdAt)}
                    </time>
                </div>
                <div className='notification-center-message'>{record.message}</div>
                {expanded && <div className='notification-center-actions'>
                    {record.actions?.map(action => this.renderAction(record.id, action))}
                </div>}
            </div>
            {hasActions && <span
                className={`codicon codicon-chevron-${expanded ? 'up' : 'down'} notification-center-expand-icon`}
                aria-hidden='true'
            />}
        </div>;
    }

    protected renderAction(notificationId: string, action: NotificationAction): React.ReactNode {
        return <button
            key={action.id}
            type='button'
            className='theia-button secondary notification-center-action'
            data-notification-id={notificationId}
            data-action-id={action.id}
            onClick={this.invokeAction}
        >
            {action.label}
        </button>;
    }

    protected readonly toggleFilter = (event: React.ChangeEvent<HTMLInputElement>): void => {
        const severity = event.currentTarget.dataset.severity as NotificationSeverity | undefined;
        if (!severity) {
            return;
        }
        if (event.currentTarget.checked) {
            this.enabledSeverities.add(severity);
        } else {
            this.enabledSeverities.delete(severity);
        }
        this.update();
    };

    protected readonly toggleActions = (event: React.MouseEvent<HTMLElement>): void => {
        const id = event.currentTarget.dataset.notificationId;
        if (!id) {
            return;
        }
        if (this.expandedIds.has(id)) {
            this.expandedIds.delete(id);
        } else {
            this.expandedIds.add(id);
        }
        this.update();
    };

    protected readonly clearAll = (): void => {
        void this.notifications.clearHistory().catch(error => {
            console.error('Failed to clear notification history.', error);
        });
    };

    protected readonly invokeAction = (event: React.MouseEvent<HTMLButtonElement>): void => {
        event.stopPropagation();
        const { notificationId, actionId } = event.currentTarget.dataset;
        if (!notificationId || !actionId) {
            return;
        }
        void this.notifications.invokeAction(notificationId, actionId).catch(error => {
            console.error('Failed to invoke notification action.', error);
        });
    };

    protected formatTime(timestamp: number): string {
        const date = new Date(timestamp);
        const part = (value: number): string => value.toString().padStart(2, '0');
        return `${part(date.getHours())}:${part(date.getMinutes())}:${part(date.getSeconds())}`;
    }

    protected scheduleMidnightRefresh(): void {
        this.clearMidnightRefresh();
        this.midnightRefreshTimeout = window.setTimeout(() => {
            this.midnightRefreshTimeout = undefined;
            this.update();
            this.scheduleMidnightRefresh();
        }, millisecondsUntilNextLocalDay());
    }

    protected clearMidnightRefresh(): void {
        if (this.midnightRefreshTimeout !== undefined) {
            window.clearTimeout(this.midnightRefreshTimeout);
            this.midnightRefreshTimeout = undefined;
        }
    }
}
