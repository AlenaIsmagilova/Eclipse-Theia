import { ContainerModule } from '@theia/core/shared/inversify';
import {
    bindViewContribution,
    FrontendApplicationContribution,
    WidgetFactory
} from '@theia/core/lib/browser';
import { NotificationCenterContribution } from './notification-center-contribution';
import { NotificationCenterFrontendService } from './notification-center-frontend-service';
import { NotificationCenterWidget } from './notification-center-widget';
import { NotificationToastOverlay } from './notification-toast-overlay';
// CSS is not emitted by tsc. Resolve it from the package source when this
// compiled module is loaded from lib/browser.
import '../../src/browser/style/notification-center.css';

export default new ContainerModule(bind => {
    bind(NotificationCenterFrontendService).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(NotificationCenterFrontendService);
    bind(NotificationToastOverlay).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(NotificationToastOverlay);

    bind(NotificationCenterWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(context => ({
        id: NotificationCenterWidget.ID,
        createWidget: () => context.container.get(NotificationCenterWidget)
    })).inSingletonScope();

    bindViewContribution(bind, NotificationCenterContribution);
    bind(FrontendApplicationContribution).toService(NotificationCenterContribution);
});
