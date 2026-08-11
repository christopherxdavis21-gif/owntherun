#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Registers the Swift pedometer plugin with Capacitor's bridge so
// registerPlugin("OwnTheRunPedometer") resolves on the JS side.
CAP_PLUGIN(OwnTheRunPedometerPlugin, "OwnTheRunPedometer",
           CAP_PLUGIN_METHOD(start, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(getDistance, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(stop, CAPPluginReturnPromise);
)
