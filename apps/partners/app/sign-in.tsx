import { SignInScreen } from '@shopinbos/ui-native';
import { auth } from '../lib/auth';

export default function SignIn() {
  return (
    <SignInScreen
      title="Sign in to your delivery company"
      allowEmail={true}
      onStart={async (input) => {
        await auth.api.auth.start(input);
      }}
      onVerify={async (input) => {
        await auth.setSession(await auth.api.auth.verify(input));
      }}
    />
  );
}
