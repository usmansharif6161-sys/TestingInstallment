// Legacy redirect — Dashboard is now the home screen (/)
import { Redirect } from 'expo-router';

export default function DashboardRedirect() {
  return <Redirect href="/" />;
}
