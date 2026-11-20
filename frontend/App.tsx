import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  StyleSheet,
  View,
  Text,
  Pressable,
} from 'react-native';

import {
  Map,
  Camera,
  LocationManager,
  Marker,
} from '@maplibre/maplibre-react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import ServerSetup from './ServerSetup';

import { API_KEY } from './config.local';


const USER_ID = 1;

const SEND_INTERVAL = 60000;
const RETRY_INTERVAL = 5000;

// Как часто загружать позиции других пользователей.
const REFRESH_LOCATIONS_INTERVAL = 15000;

type LocationListener =
  Parameters<typeof LocationManager.addListener>[0];

type LocationPosition =
  Parameters<LocationListener>[0];

type CurrentLocation = {
  userId: number;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  recordedAt: string;
};

export default function App() {

  const [apiUrl, setApiUrl] = useState('');
  const [configLoaded, setConfigLoaded] = useState(false);
  const [isEditingServer, setIsEditingServer] = useState(false);

  useEffect(() => {
  const loadServer = async () => {
    try {
      const savedUrl = await AsyncStorage.getItem('API_URL');

      if (savedUrl) {
        setApiUrl(savedUrl);
      }
    } catch (error) {
      console.error('Ошибка загрузки адреса сервера:', error);
    } finally {
      setConfigLoaded(true);
    }
  };

  loadServer();
  }, []);

  const handleServerConnected = async (url: string) => {
      await AsyncStorage.setItem('API_URL', url);
    setApiUrl(url);
    setIsEditingServer(false);
    };

  const [hasLocationPermission, setHasLocationPermission] =
    useState(false);

  const [isFollowing, setIsFollowing] = useState(false);

  const [otherUsers, setOtherUsers] =
  useState<CurrentLocation[]>([]);

  const [myLocation, setMyLocation] =
  useState<CurrentLocation | null>(null);
  const latestPosition = useRef<LocationPosition | null>(null);

  // Запрашиваем разрешение на геолокацию.
  useEffect(() => {
    const requestLocationPermission = async () => {
      try {
        const granted = await LocationManager.requestPermissions();

        setHasLocationPermission(granted);

        if (!granted) {
          Alert.alert(
            'Нет доступа к геолокации',
            'Разрешите приложению доступ к местоположению в настройках Android.',
          );
        }
      } catch (error) {
        console.error('Location permission error:', error);

        Alert.alert(
          'Ошибка геолокации',
          'Не удалось запросить разрешение на местоположение.',
        );
      }
    };

    requestLocationPermission();
  }, []);

  // Получаем GPS и отправляем координаты на сервер.
  useEffect(() => {
    if (!hasLocationPermission || !isFollowing) {
      return;
    }

    let isActive = true;
    let isSending = false;

    let retryTimeout: ReturnType<typeof setTimeout> | null = null;

    const scheduleRetry = () => {
      if (!isActive || retryTimeout !== null) {
        return;
      }

      retryTimeout = setTimeout(() => {
        retryTimeout = null;
        sendLocation();
      }, RETRY_INTERVAL);
    };

    const sendLocation = async () => {
      if (!isActive || isSending) {
        return;
      }

      const position = latestPosition.current;

      if (!position) {
        console.log('Ожидаем первое GPS-определение');
        return;
      }

      const { latitude, longitude, accuracy } = position.coords;

      isSending = true;

      try {
        const response = await fetch(`${apiUrl}/api/locations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': API_KEY,
          },
          body: JSON.stringify({
            userId: USER_ID,
            latitude,
            longitude,
            accuracy,
          }),
        });

        if (!isActive) {
          return;
        }

        if (!response.ok) {
          const errorText = await response.text();

          console.error(
            'API error:',
            response.status,
            errorText,
          );

          if (response.status >= 500) {
            scheduleRetry();
          }

          return;
        }

        console.log(
          'Координаты отправлены:',
          latitude,
          longitude,
        );
      } catch (error) {
        if (!isActive) {
          return;
        }

        console.error('Ошибка отправки координат:', error);
        scheduleRetry();
      } finally {
        isSending = false;
      }
    };

    let firstLocationReceived = false;

    const handleLocationUpdate: LocationListener = position => {
      latestPosition.current = position;

      setMyLocation({
        userId: USER_ID,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy ?? null,
        recordedAt: new Date().toISOString(),
      });

      console.log(
        'GPS:',
        position.coords.latitude,
        position.coords.longitude,
      );

      if (!firstLocationReceived) {
        firstLocationReceived = true;
        sendLocation();
      }
    };

    LocationManager.addListener(handleLocationUpdate);
    LocationManager.start();

    const intervalId = setInterval(
      sendLocation,
      SEND_INTERVAL,
    );

    console.log('GPS tracking started');

    return () => {
      isActive = false;

      clearInterval(intervalId);

      if (retryTimeout !== null) {
        clearTimeout(retryTimeout);
      }

      LocationManager.removeListener(handleLocationUpdate);
      LocationManager.stop();

      latestPosition.current = null;

      console.log('GPS tracking stopped');
    };
  }, [hasLocationPermission, isFollowing, apiUrl]);



  useEffect(() => {
    let isActive = true;

    const loadCurrentLocations = async () => {
      try {
        const response = await fetch(
          `${apiUrl}/api/locations/current`,
          {
            method: 'GET',
            headers: {
              'X-Api-Key': API_KEY,
            },
          },
        );

        if (!response.ok) {
          throw new Error(
            `API error: ${response.status}`,
          );
        }

        const locations: CurrentLocation[] =
          await response.json();

        if (!isActive) {
          return;
        }

        setOtherUsers(locations);

        console.log(
          'Загружено позиций пользователей:',
          locations.length,
        );
      } catch (error) {
        if (isActive) {
          console.error(
            'Ошибка загрузки позиций пользователей:',
            error,
          );
        }
      }
    };

    // Первый запрос выполняется сразу.
    loadCurrentLocations();

    // Затем обновляем позиции каждые 15 секунд.
    const intervalId = setInterval(
      loadCurrentLocations,
      REFRESH_LOCATIONS_INTERVAL,
    );

    return () => {
      isActive = false;
      clearInterval(intervalId);
    };
  }, [apiUrl]);

  // Кнопка включения и отключения слежения.
  const handleLocationPress = () => {
    if (!hasLocationPermission) {
      Alert.alert(
        'Нет доступа',
        'Приложению необходимо разрешение на геолокацию.',
      );
      return;
    }

    setIsFollowing(previous => !previous);
  };

  if (!configLoaded) {
  return (
    <View style={styles.container}>
      <Text>Загрузка настроек...</Text>
    </View>
  );
}

if (!apiUrl || isEditingServer) {
  return (
    <ServerSetup
      initialUrl={apiUrl || 'http://192.168.1.119:8080'}
      onConnected={handleServerConnected}
    />
  );
}

  return (
    <View style={styles.container}>
      <Map style={styles.map} mapStyle="https://tiles.openfreemap.org/styles/liberty">
        <Camera
          initialViewState={{
            center: [65.5343, 57.1530],
            zoom: 11,
          }}
          trackUserLocation={isFollowing ? 'default' : undefined}
        />

        {/* Собственная позиция */}
{myLocation && (
  <Marker
    id="my-location"
    lngLat={[
      myLocation.longitude,
      myLocation.latitude,
    ]}
    anchor="center"
  >
    <View style={styles.myMarker}>
      <Text style={styles.markerText}>Я</Text>
    </View>
  </Marker>
)}

{/* Позиции остальных пользователей */}
{otherUsers
  .filter(user => user.userId !== USER_ID)
  .map(user => (
    <Marker
      key={user.userId}
      id={`user-${user.userId}`}
      lngLat={[user.longitude, user.latitude]}
      anchor="center"
    >
      <View style={styles.otherMarker}>
        <Text style={styles.markerText}>
          {user.userId}
        </Text>
      </View>
    </Marker>
  ))}

        {otherUsers.map(user => (
          <Marker
            key={user.userId}
            id={`user-${user.userId}`}
            lngLat={[user.longitude, user.latitude]}
            anchor="center"
          >
            <View style={styles.userMarker}>
              <Text style={styles.userMarkerText}>
                {user.userId}
              </Text>
            </View>
          </Marker>
        ))}
      </Map>
        <Pressable
            style={styles.serverButton} onPress={() => setIsEditingServer(true)}>
            <Text style={styles.buttonText}>Сервер</Text>
      </Pressable>
      <Pressable
        style={styles.locationButton}
        onPress={handleLocationPress}
      >
        <Text style={styles.buttonText}>
          {isFollowing
            ? 'Отключить слежение'
            : 'Моё местоположение'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  map: {
    flex: 1,
  },

  locationButton: {
    position: 'absolute',
    bottom: 35,
    alignSelf: 'center',
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 12,
    elevation: 5,
  },

  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },

  userMarker: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#DC2626',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
  },

  userMarkerText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

    myMarker: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#2563EB',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },

  otherMarker: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#DC2626',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
  },

  serverButton: {
    position: 'absolute',
    top: 50,
    right: 16,
    backgroundColor: '#475569',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    elevation: 5,
  },

  markerText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
