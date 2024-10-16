import { BusinessError } from '@ohos.base';
import ble from '@ohos.bluetooth.ble';
import constant from '@ohos.bluetooth.constant';
import access from '@ohos.bluetooth.access';
// import proto_sdk from 'libbc_proto_sdk.so';

const bcUUIDPrefix = '4DE5A20C';
const bcUUIDSuffix = 'BF63-0242AC130002';

const morpheusServiceUuid = `${bcUUIDPrefix}-0001-AE02-${bcUUIDSuffix}`;
// const morpheusTxUuid = `${bcUUIDPrefix}-0002-AE02-${bcUUIDSuffix}`;
const morpheusRxUuid = `${bcUUIDPrefix}-0003-AE02-${bcUUIDSuffix}`;

const batteryServiceUuid = '0000180F-0000-1000-8000-00805F9B34FB';
const batteryCharacteristicUuid = '00002A19-0000-1000-8000-00805F9B34FB';

// 先只支持单个设备连接
let targetDevice;

function writeCharacteristicValueCallBack(code: BusinessError) {
  if (code != null) {
    return;
  }
  console.log('bluetooth writeCharacteristicValue success');
}


function bleTest() {
  console.log('BLE test');
  try {
    access.on('stateChange', onBluetoothStateChanged);

    let state = access.getState();
    printBluetoothState(state);
    if (state === access.BluetoothState.STATE_ON) {
      startScanMorpheus();
    }
  } catch (err) {
    console.error('errCode: ' + (err as BusinessError).code + ', errMessage: ' + (err as BusinessError).message);
  }
}

function printBluetoothState(state: access.BluetoothState) {
  if (state === access.BluetoothState.STATE_OFF) {
    console.info('bluetooth state is off');
  } else if (state === access.BluetoothState.STATE_TURNING_OFF) {
    console.info('bluetooth state is turning off');
  } else if (state === access.BluetoothState.STATE_ON) {
    console.info('bluetooth state is on');
  } else if (state === access.BluetoothState.STATE_TURNING_ON) {
    console.info('bluetooth state is turning on');
  } else if (state === access.BluetoothState.STATE_BLE_ON) {
    console.info('bluetooth state is STATE_BLE_ON');
  } else if (state === access.BluetoothState.STATE_BLE_TURNING_OFF) {
    console.info('bluetooth state is STATE_BLE_TURNING_OFF');
  } else {
    console.log(`unknown bluetooth state: ${JSON.stringify(state)}`);
  }
}

function onBluetoothStateChanged(state: access.BluetoothState) {
  printBluetoothState(state);
}

function startScanMorpheus() {
  try {
    ble.on("BLEDeviceFind", onDeviceFound);
    let scanFilter: ble.ScanFilter = {
      // deviceId:"XX:XX:XX:XX:XX:XX",
      name: "LE-Easleep-3A6EE",
      serviceUuid: morpheusServiceUuid,
    };
    let scanOptions: ble.ScanOptions = {
      interval: 500,
      dutyMode: ble.ScanDuty.SCAN_MODE_LOW_POWER,
      matchMode: ble.MatchMode.MATCH_MODE_AGGRESSIVE
    }
    console.log('startBLEScan');
    ble.startBLEScan([scanFilter], scanOptions);
  } catch (err) {
    console.error('errCode: ' + (err as BusinessError).code + ', errMessage: ' + (err as BusinessError).message);
  }
}

async function onConnectStateChanged(state: ble.BLEConnectionChangeState) {
  let connectState: constant.ProfileConnectionState = state.state;
  if (targetDevice) targetDevice.rawConnectState = connectState;

  if (connectState === constant.ProfileConnectionState.STATE_DISCONNECTED) {
    console.info('BLE disconnected');
    if (targetDevice) {
      targetDevice.connectivity = connectState;
      targetDevice.tx = null;
    }
  } else if (connectState === constant.ProfileConnectionState.STATE_DISCONNECTING) {
    console.info('BLE disconnecting');
    if (targetDevice) {
      targetDevice.connectivity = connectState;
      targetDevice.tx = null;
    }
  } else if (connectState === constant.ProfileConnectionState.STATE_CONNECTING) {
    console.info('BLE connecting');
  } else if (connectState === constant.ProfileConnectionState.STATE_CONNECTED) {
    console.info('BLE connected');
    setTimeout(() => {
      if (targetDevice && targetDevice.rawConnectState === constant.ProfileConnectionState.STATE_CONNECTED)
        onConnected();
    }, 500);
  }
}

function onDeviceFound(data: Array<ble.ScanResult>) {
  for (let i = 0; i < data.length; i++) {
    console.info('found device id: ' + data[i].deviceId + ', device name: ' + data[i].deviceName);
  }
  if (data.length > 0) {
    try {
      ble.stopBLEScan();
    } catch (err) {
      console.error('errCode: ' + (err as BusinessError).code + ', errMessage: ' + (err as BusinessError).message);
    }

    let device = data[0];
    let deviceId = device.deviceId;
    connectDevice(deviceId);
  }
}

function connectDevice(deviceId: string) {
  try {
    let device: ble.GattClientDevice = ble.createGattClientDevice(deviceId);
    device.on('BLEConnectionStateChange', onConnectStateChanged);
    device.on('BLEMtuChange', (mtu: number) => {
      console.info('BLEMtuChange, mtu: ' + mtu);
    });
    targetDevice = { gatt: device, connectivity: constant.ProfileConnectionState.STATE_CONNECTING };
    device.connect();
  } catch (err) {
    console.error('errCode: ' + (err as BusinessError).code + ', errMessage: ' + (err as BusinessError).message);
  }
}

async function onConnected() {
  if (!targetDevice) {
    console.error('targetDevice is null');
    return;
  }
  if (targetDevice.rawConnectState != constant.ProfileConnectionState.STATE_CONNECTED) {
    console.error('targetDevice is not connected');
    return;
  }
  let gattClient = targetDevice.gatt;
  if (!gattClient) {
    console.error('gattClient is null');
    return;
  }
  gattClient.setBLEMtuSize(512);
  console.info('setBLEMtuSize done');

  try {
    console.info('getServices ...');
    const services = await gattClient.getServices();
    console.info('getServices successfully:' + JSON.stringify(services.map((service) => service.serviceUuid)));
    if (services.length > 0) {
      let morpheusService = services.find((service) => service.serviceUuid === morpheusServiceUuid);
      console.info('morpheusService = ' + JSON.stringify(morpheusService.serviceUuid));

      let tx = morpheusService.characteristics.find((characteristic) => characteristic.properties.write === true || characteristic.properties.writeNoResponse === true);
      console.info(`tx = ${tx.characteristicUuid}, properties = ${JSON.stringify(tx.properties)}`);
      targetDevice.tx = tx;

      let rx = morpheusService.characteristics.find((characteristic) => characteristic.properties.notify === true || characteristic.properties.indicate === true);
      console.info(`rx = ${rx.characteristicUuid}, properties = ${JSON.stringify(rx.properties)}`);

      gattClient.on('BLECharacteristicChange', onCharacteristicChange);

      let batteryService = services.find((service) => service.serviceUuid === batteryServiceUuid);
      let batteryCharacteristic = batteryService.characteristics.find((characteristic) => characteristic.characteristicUuid === batteryCharacteristicUuid);
      console.info(`batteryService = ${JSON.stringify(batteryService.serviceUuid)}, batteryCharacteristic = ${JSON.stringify(batteryCharacteristic.characteristicUuid)}`);

      console.info('enable data stream notification');
      await gattClient.setCharacteristicChangeNotification(rx, true);
      console.info(`enable data stream notification successfully`);

      console.info('enable battery level notification');
      await gattClient.setCharacteristicChangeNotification(batteryCharacteristic, true);
      console.info(`enable battery level notification successfully`);

      console.info('read battery level');
      await gattClient.readCharacteristicValue(batteryCharacteristic);
      // const c = await gattClient.readCharacteristicValue(batteryCharacteristic);
      // console.info(`read battery level result: ${JSON.stringify(c.characteristicValue)}`);
      targetDevice.connectivity = constant.ProfileConnectionState.STATE_CONNECTED;
    }
  } catch (error) {
    console.error('Error during BLE operations:', error);
    if (targetDevice && (targetDevice.connectivity == constant.ProfileConnectionState.STATE_CONNECTED)) {
      targetDevice.tx = null;
      targetDevice.connectivity = constant.ProfileConnectionState.STATE_DISCONNECTED;
    }
  }
}

async function onCharacteristicChange(characteristicChangeReq: ble.BLECharacteristic) {
  let serviceUuid: string = characteristicChangeReq.serviceUuid;
  let characteristicUuid: string = characteristicChangeReq.characteristicUuid;
  let value: Uint8Array = new Uint8Array(characteristicChangeReq.characteristicValue);
  if (serviceUuid === morpheusServiceUuid && characteristicUuid === morpheusRxUuid) {
    console.info(`rx data: ${value}`);
    // await proto_sdk.didReceiveData(value);
    // listenMessages();
    // console.info(`rx data done`);
  } else if (serviceUuid === batteryServiceUuid && characteristicUuid === batteryCharacteristicUuid) {
    console.info(`battery level: ${value}`);
  }
}

export {
  bleTest,
};