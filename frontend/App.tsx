
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
import * as Keychain from 'react-native-keychain';

import ServerSetup from './ServerSetup';
import AuthScreen from './AuthScreen';

const KEYCHAIN_SERVICE = 'geosocial.auth';

const SEND_INTERVAL = 60000;
const RETRY_INTERVAL = 5000;
const REFRESH_LOCATIONS_INTERVAL = 15000;

type AuthResponse = {
  userId: number;
  name: string;
  email: string;
  token: string;
};

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

  const [authChecked, setAuthChecked] = useState(false);
  const [authUser, setAuthUser] = useState<AuthResponse | null>(null);

  const [hasLocationPermission, setHasLocationPermission] =
    useState(false);

  const [isFollowing, setIsFollowing] = useState(false);

  const [otherUsers, setOtherUsers] =
    useState<CurrentLocation[]>([]);

  const [myLocation, setMyLocation] =
    useState<CurrentLocation | null>(null);

  const latestPosition = useRef<LocationPosition | null>(null);

  // Загружаем адрес API из локальных настроек.
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

  // Сохраняем новый адрес API.
  const handleServerConnected = async (url: string) => {
    await AsyncStorage.setItem('API_URL', url);

    setApiUrl(url);
    setAuthUser(null);
    setAuthChecked(false);
    setIsFollowing(false);
    setMyLocation(null);
    setOtherUsers([]);
    setIsEditingServer(false);
  };

  // Восстанавливаем JWT и проверяем его через защищённый API.
  useEffect(() => {
    if (!configLoaded || !apiUrl) {
      return;
    }

    let isActive = true;

    const restoreSession = async () => {
      setAuthChecked(false);

      try {
        const credentials = await Keychain.getGenericPassword({
          service: KEYCHAIN_SERVICE,
        });

        if (!credentials) {
          if (isActive) {
            setAuthUser(null);
            setAuthChecked(true);
          }
          return;
        }

        const userId = Number(credentials.username);
        const token = credentials.password;

        if (!Number.isInteger(userId) || userId <= 0 || !token) {
          await Keychain.resetGenericPassword({
            service: KEYCHAIN_SERVICE,
          });

          if (isActive) {
            setAuthUser(null);
            setAuthChecked(true);
          }
          return;
        }

        const response = await fetch(
          `${apiUrl}/api/users/${userId}`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        if (!response.ok) {
          await Keychain.resetGenericPassword({
            service: KEYCHAIN_SERVICE,
          });

          if (isActive) {
            setAuthUser(null);
          }
          return;
        }

        const user = await response.json();

        if (isActive) {
          setAuthUser({
            userId: user.id,
            name: user.name,
            email: user.email,
            token,
          });
        }
      } catch (error) {
        console.error('Ошибка восстановления сессии:', error);

        if (isActive) {
          setAuthUser(null);
        }
      } finally {
        if (isActive) {
          setAuthChecked(true);
        }
      }
    };

    restoreSession();

    return () => {
      isActive = false;
    };
  }, [configLoaded, apiUrl]);

  // Сохраняем результат успешной регистрации или входа.
  const handleAuthenticated = async (result: AuthResponse) => {
    await Keychain.setGenericPassword(
      String(result.userId),
      result.token,
      {
        service: KEYCHAIN_SERVICE,
      },
    );

    setAuthUser(result);
    setAuthChecked(true);
  };

  // Выход из аккаунта.
  const handleLogout = () => {
    Alert.alert(
      'Выход из аккаунта',
      'Завершить текущую сессию?',
      [
        {
          text: 'Отмена',
          style: 'cancel',
        },
        {
          text: 'Выйти',
          style: 'destructive',
          onPress: async () => {
            try {
              await Keychain.resetGenericPassword({
                service: KEYCHAIN_SERVICE,
              });
            } catch (error) {
              console.error('Ошибка удаления сессии:', error);
            }

            setIsFollowing(false);
            setAuthUser(null);
            setMyLocation(null);
            setOtherUsers([]);
          },
        },
      ],
    );
  };

  // Запрашиваем разрешение на геолокацию только после входа.
  useEffect(() => {
    if (!authUser) {
      setHasLocationPermission(false);
      return;
    }

    let isActive = true;

    const requestLocationPermission = async () => {
      try {
        const granted = await LocationManager.requestPermissions();

        if (!isActive) {
          return;
        }

        setHasLocationPermission(granted);

        if (!granted) {
          Alert.alert(
            'Нет доступа к геолокации',
            'Разрешите приложению доступ к местоположению в настройках Android.',
          );
        }
      } catch (error) {
        console.error('Location permission error:', error);

        if (isActive) {
          Alert.alert(
            'Ошибка геолокации',
            'Не удалось запросить разрешение на местоположение.',
          );
        }
      }
    };

    requestLocationPermission();

    return () => {
      isActive = false;
    };
  }, [authUser]);

  // Получаем GPS и отправляем координаты авторизованного пользователя.
  useEffect(() => {
    if (!authUser || !hasLocationPermission || !isFollowing) {
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
        return;
      }

      const { latitude, longitude, accuracy } = position.coords;

      isSending = true;

      try {
        const response = await fetch(`${apiUrl}/api/locations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authUser.token}`,
          },
          body: JSON.stringify({
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
            'Ошибка отправки координат:',
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
        userId: authUser.userId,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy ?? null,
        recordedAt: new Date().toISOString(),
      });

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

    return () => {
      isActive = false;

      clearInterval(intervalId);

      if (retryTimeout !== null) {
        clearTimeout(retryTimeout);
      }

      LocationManager.removeListener(handleLocationUpdate);
      LocationManager.stop();

      latestPosition.current = null;
    };
  }, [authUser, hasLocationPermission, isFollowing, apiUrl]);

  // Загружаем координаты всех пользователей для отображения на карте.
  useEffect(() => {
    if (!authUser) {
      setOtherUsers([]);
      return;
    }

    let isActive = true;

    const loadCurrentLocations = async () => {
      try {
        const response = await fetch(
          `${apiUrl}/api/locations/current`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${authUser.token}`,
            },
          },
        );

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const locations: CurrentLocation[] =
          await response.json();

        if (isActive) {
          setOtherUsers(locations);
        }
      } catch (error) {
        if (isActive) {
          console.error(
            'Ошибка загрузки позиций пользователей:',
            error,
          );
        }
      }
    };

    loadCurrentLocations();

    const intervalId = setInterval(
      loadCurrentLocations,
      REFRESH_LOCATIONS_INTERVAL,
    );

    return () => {
      isActive = false;
      clearInterval(intervalId);
    };
  }, [authUser, apiUrl]);

  // Включение и отключение отправки координат.
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
      <View style={styles.loadingContainer}>
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

  if (!authChecked) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Проверка авторизации...</Text>
      </View>
    );
  }

  if (!authUser) {
    return (
      <AuthScreen
        apiUrl={apiUrl}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  return (
    <View style={styles.container}>
      <Map
        style={styles.map}
        mapStyle="https://tiles.openfreemap.org/styles/liberty"
      >
        <Camera
          initialViewState={{
            center: [65.5343, 57.1530],
            zoom: 11,
          }}
          trackUserLocation={isFollowing ? 'default' : undefined}
        />

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

        {otherUsers
          .filter(user => user.userId !== authUser.userId)
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
      </Map>

      <View style={styles.topBar}>
        <Text style={styles.userName}>
          {authUser.name}
        </Text>

        <Pressable
          style={styles.smallButton}
          onPress={() => setIsEditingServer(true)}
        >
          <Text style={styles.buttonText}>Сервер</Text>
        </Pressable>

        <Pressable
          style={styles.smallButton}
          onPress={handleLogout}
        >
          <Text style={styles.buttonText}>Выйти</Text>
        </Pressable>
      </View>

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

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },

  map: {
    flex: 1,
  },

  topBar: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },

  userName: {
    flex: 1,
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '700',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },

  smallButton: {
    backgroundColor: '#475569',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    elevation: 5,
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
    fontSize: 14,
    fontWeight: '600',
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

  markerText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
