import { Disposable, DisposableCollection } from '@theia/core';
import { FrontendApplication, FrontendApplicationContribution } from '@theia/core/lib/browser';
import * as React from '@theia/core/shared/react';
import { createRoot, Root } from '@theia/core/shared/react-dom/client';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { NotificationAction, NotificationRecord } from '../common/notification-protocol';
import { NotificationCenterFrontendService } from './notification-center-frontend-service';

@injectable()
export class NotificationToastOverlay implements FrontendApplicationContribution, Disposable {

    protected readonly toDispose = new DisposableCollection();
    protected container!: HTMLDivElement;
    protected containerRoot!: Root;

    constructor(
        @inject(NotificationCenterFrontendService)
        protected readonly notifications: NotificationCenterFrontendService
    ) { }

    @postConstruct()
    protected init(): void {
        this.container = window.document.createElement('div');
        this.container.className = 'theia-notification-center-toast-overlay';
        this.container.setAttribute('aria-live', 'polite');
        window.document.body.appendChild(this.container);
        this.containerRoot = createRoot(this.container);

        this.toDispose.push(this.notifications.onDidChangeToasts(() => this.render()));
        this.toDispose.push(Disposable.create(() => {
            this.containerRoot.unmount();
            this.container.remove();
        }));
        this.render();
    }

    onStop(_app: FrontendApplication): void {
        this.dispose();
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected render(): void {
        this.containerRoot.render(<div className='notification-center-toast-list'>
            {this.notifications.toasts.map(notification => this.renderToast(notification))}
        </div>);
    }

    protected renderToast(notification: NotificationRecord): React.ReactNode {
        const icon = notification.severity === 'warning'
            ? 'warning'
            : notification.severity === 'error' ? 'error' : 'info';

        return <section
            key={notification.id}
            className={`notification-center-toast notification-center-toast-${notification.severity}`}
            data-notification-id={notification.id}
            role={notification.severity === 'error' ? 'alert' : 'status'}
        >
            <span
                className={`codicon codicon-${icon} notification-center-toast-icon`}
                aria-label={notification.severity}
                title={notification.severity}
            />
            <div className='notification-center-toast-body'>
                <strong className='notification-center-toast-title'>{notification.title}</strong>
                <div className='notification-center-toast-message'>{notification.message}</div>
                {(notification.actions?.length ?? 0) > 0 && <div className='notification-center-toast-actions'>
                    {notification.actions?.map(action => this.renderAction(notification.id, action))}
                </div>}
            </div>
            <button
                type='button'
                className='notification-center-toast-close codicon codicon-close'
                aria-label={`Close ${notification.title}`}
                title='Close'
                onClick={() => this.notifications.dismissToast(notification.id)}
            />
        </section>;
    }

    protected renderAction(notificationId: string, action: NotificationAction): React.ReactNode {
        return <button
            key={action.id}
            type='button'
            className='theia-button secondary notification-center-toast-action'
            data-notification-id={notificationId}
            data-action-id={action.id}
            onClick={() => {
                void this.notifications.invokeToastAction(notificationId, action.id).catch(error => {
                    console.error('Failed to invoke notification action.', error);
                });
            }}
        >
            {action.label}
        </button>;
    }
}
