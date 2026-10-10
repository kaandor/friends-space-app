import ProfileEditor from './ProfileEditor/ProfileEditor'

interface EditProfileProps {
  onClose: () => void
}

export function EditProfile({ onClose }: EditProfileProps) {
  return <ProfileEditor onClose={onClose} />
}