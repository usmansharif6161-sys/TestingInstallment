import { useRouter } from 'expo-router';
import { useEffect } from 'react';

// Signup is disabled — only admin can create accounts
export default function SignUpScreen() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/login');
  }, [router]);
  return null;
}
