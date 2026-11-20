
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type AuthResponse = {
  userId: number;
  name: string;
  email: string;
  token: string;
};

type Props = {
  apiUrl: string;
  onAuthenticated: (result: AuthResponse) => Promise<void>;
};

export default function AuthScreen({ apiUrl, onAuthenticated }: Props) {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleAuth = async () => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password || (isRegister && !name.trim())) {
      Alert.alert('Ошибка', 'Заполните все необходимые поля.');
      return;
    }

    if (isRegister && password.length < 8) {
      Alert.alert('Ошибка', 'Пароль должен содержать минимум 8 символов.');
      return;
    }

    setIsLoading(true);

    try {
      const endpoint = isRegister ? 'register' : 'login';

      const body = isRegister
        ? { name: name.trim(), email: normalizedEmail, password }
        : { email: normalizedEmail, password };

      const response = await fetch(`${apiUrl}/api/auth/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Ошибка сервера: ${response.status}`);
      }

      const result: AuthResponse = await response.json();
      await onAuthenticated(result);
    } catch (error) {
      Alert.alert(
        'Ошибка авторизации',
        error instanceof Error ? error.message : 'Не удалось выполнить запрос.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>GeoSocial</Text>
      <Text style={styles.subtitle}>
        {isRegister ? 'Создание аккаунта' : 'Вход в аккаунт'}
      </Text>

      {isRegister && (
        <TextInput
          style={styles.input}
          placeholder="Имя"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
        />
      )}

      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <TextInput
        style={styles.input}
        placeholder="Пароль"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
      />

      <Pressable
        style={styles.primaryButton}
        onPress={handleAuth}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonText}>
            {isRegister ? 'Зарегистрироваться' : 'Войти'}
          </Text>
        )}
      </Pressable>

      <Pressable
        style={styles.switchButton}
        onPress={() => setIsRegister(previous => !previous)}
        disabled={isLoading}
      >
        <Text style={styles.switchText}>
          {isRegister
            ? 'Уже есть аккаунт? Войти'
            : 'Нет аккаунта? Зарегистрироваться'}
        </Text>
      </Pressable>
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
    color: '#2563EB',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    textAlign: 'center',
    color: '#475569',
    marginBottom: 28,
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
    fontSize: 16,
    color: '#0F172A',
  },
  primaryButton: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    padding: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  switchButton: {
    padding: 16,
    alignItems: 'center',
  },
  switchText: {
    color: '#2563EB',
    fontSize: 15,
  },
});
