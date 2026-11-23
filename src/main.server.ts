import '@angular/localize/init';
import { ApplicationRef, provideZoneChangeDetection } from '@angular/core';
import { BootstrapContext } from '@angular/platform-browser';
import { AppServerModule } from './app/app.server.module';
export { AppServerModule } from './app/app.server.module';

// Angular 21 installs its default scheduler during NgModule bootstrap. Supply
// the existing zone-based behavior here so it is not overwritten afterwards.
export default async function bootstrap(context: BootstrapContext): Promise<ApplicationRef> {
  const module = await context.platformRef.bootstrapModule(AppServerModule, {
    applicationProviders: [provideZoneChangeDetection()],
  });
  return module.injector.get(ApplicationRef);
}
