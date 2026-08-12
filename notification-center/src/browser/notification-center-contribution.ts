import {
    AbstractViewContribution,
    FrontendApplication,
    FrontendApplicationContribution
} from '@theia/core/lib/browser';
import { Command, CommandRegistry } from '@theia/core/lib/common/command';
import { inject, injectable } from '@theia/core/shared/inversify';
import { Notification, NotificationSeverity } from '../common/notification-protocol';
import { NotificationCenterFrontendService } from './notification-center-frontend-service';
import { NotificationCenterWidget } from './notification-center-widget';

const PUSH_INFO_COMMAND: Command = {
    id: 'notification-center.pushInfo',
    category: NotificationCenterWidget.LABEL,
    label: 'Push Info'
};

const PUSH_WARNING_COMMAND: Command = {
    id: 'notification-center.pushWarning',
    category: NotificationCenterWidget.LABEL,
    label: 'Push Warning'
};

const PUSH_ERROR_COMMAND: Command = {
    id: 'notification-center.pushError',
    category: NotificationCenterWidget.LABEL,
    label: 'Push Error'
};

@injectable()
export class NotificationCenterContribution
    extends AbstractViewContribution<NotificationCenterWidget>
    implements FrontendApplicationContribution {

    constructor(
        @inject(NotificationCenterFrontendService)
        protected readonly notifications: NotificationCenterFrontendService
    ) {
        super({
            widgetId: NotificationCenterWidget.ID,
            widgetName: NotificationCenterWidget.LABEL,
            defaultWidgetOptions: {
                area: 'right',
                rank: 500
            },
            toggleCommandId: 'notification-center.toggle'
        });
    }

    override registerCommands(commands: CommandRegistry): void {
        super.registerCommands(commands);
        this.registerPushCommand(commands, PUSH_INFO_COMMAND, 'info');
        this.registerPushCommand(commands, PUSH_WARNING_COMMAND, 'warning');
        this.registerPushCommand(commands, PUSH_ERROR_COMMAND, 'error');
    }

    async initializeLayout(_app: FrontendApplication): Promise<void> {
        await this.openView({ reveal: true });
    }

    protected registerPushCommand(
        commands: CommandRegistry,
        command: Command,
        severity: NotificationSeverity
    ): void {
        commands.registerCommand(command, {
            execute: () => this.notifications.push(this.createDemoNotification(severity))
        });
    }

    protected createDemoNotification(severity: NotificationSeverity): Notification {
        const title = severity === 'warning'
            ? 'Warning notification'
            : severity === 'error' ? 'Error notification' : 'Information notification';
        return {
            id: this.createId(),
            severity,
            title,
            message: `Demo ${severity} generated from the command palette.`,
            actions: [{ id: 'acknowledge', label: 'Acknowledge' }]
        };
    }

    protected createId(): string {
        if (typeof globalThis.crypto?.randomUUID === 'function') {
            return globalThis.crypto.randomUUID();
        }
        return `notification-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
}
