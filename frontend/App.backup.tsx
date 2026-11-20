import React, { useState } from 'react';
import { View, Text, TextInput, Button } from 'react-native';

const API_URL = 'http://192.168.1.119:8080/api/users'; 

export default function App() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [result, setResult] = useState('');

  const sendUser = async () => {
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email }),
      });
      const data = await response.json();
      setResult(JSON.stringify(data));
    } catch (error) {
      setResult('Ошибка: ' + String(error));
    }
  };

  return (
    <View style={{ padding: 20, marginTop: 50 }}>
      <TextInput
        placeholder="Имя"
        value={name}
        onChangeText={setName}
        style={{ borderWidth: 1, padding: 8, marginBottom: 10 }}
      />
      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        style={{ borderWidth: 1, padding: 8, marginBottom: 10 }}
      />
      <Button title="Отправить" onPress={sendUser} />
      <Text style={{ marginTop: 20 }}>{result}</Text>
    </View>
  );
}