
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';

type Props = {
  initialUrl: string;
  onConnected: (url: string) => void;
};

export default function ServerSetup({
  initialUrl,
  onConnected,
}: Props) {
  const [url, setUrl] = useState(initialUrl);
  const [status, setStatus] = useState('');
  const [isChecking, setIsChecking] = useState(false);

  const checkConnection = async () => {
    const normalizedUrl = url.trim().replace(/\/+$/, '');

    if (!normalizedUrl.startsWith('http://') &&
        !normalizedUrl.startsWith('https://')) {
      setStatus('Адрес должен начинаться с http:// или https://');
      return;
    }

    setIsChecking(true);
    setStatus('');

    try {
      const response = await fetch(`${normalizedUrl}/health`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      onConnected(normalizedUrl);
    } catch (error) {
      console.error('Server connection error:', error);
      setStatus('Не удалось подключиться. Проверь адрес и доступность сервера.');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>GeoSocial</Text>

      <Text style={styles.description}>
        Укажите адрес сервера приложения
      </Text>

      <TextInput
        style={styles.input}
        value={url}
        onChangeText={setUrl}
        placeholder="https://your-api.onrender.com"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />

      <Pressable
        style={styles.button}
        onPress={checkConnection}
        disabled={isChecking}
      >
        {isChecking ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonText}>
            Проверить соединение
          </Text>
        )}
      </Pressable>

      {status !== '' && (
        <Text style={styles.error}>{status}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#FFFFFF',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
    color: '#2563EB',
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    color: '#444444',
  },
  input: {
    borderWidth: 1,
    borderColor: '#CCCCCC',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    marginBottom: 16,
    color: '#222222',
  },
  button: {
    backgroundColor: '#2563EB',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    color: '#DC2626',
    textAlign: 'center',
    marginTop: 16,
  },
});
