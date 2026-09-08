import { Slot } from 'expo-router';

// No tabs — this group is just a transparent wrapper for the login route
export default function TabLayout() {
  return <Slot />;
}
