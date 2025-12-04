// Ensure Supabase client is loaded first (assuming it will be included in HTML)
document.addEventListener('DOMContentLoaded', async () => {
  if (typeof supabase === 'undefined' || !supabase.createClient) {
    console.error(
      "Supabase client library not loaded. Make sure it's included in profile.html.",
    );
    handleError(new Error('Supabase library missing'), 'Initialization failed');
    return;
  }

  // Import S3 client from AWS SDK
  const { S3 } = AWS;

  // Cloudflare R2 Configuration for profile-logos
  const CLOUDFLARE_ACCOUNT_ID_PROFILE = 'bf2a9e62933c4a2fb5ead76575f17def';
  const CLOUDFLARE_ACCESS_KEY_ID_PROFILE = 'ce2cc917d1b6d104718abaaa0cbe2ec9';
  const CLOUDFLARE_SECRET_ACCESS_KEY_PROFILE =
    '44e32ecead692a2044044f3007d63419804e8bca1d4afc09f5a890f7ed785c54';
  const CLOUDFLARE_BUCKET_NAME_PROFILE = 'profile-logos';
  const CLOUDFLARE_PUBLIC_BASE_URL_PROFILE =
    'https://pub-5fb591cc50d748d4b3db0865c481692e.r2.dev';

  const r2ClientProfile = new S3({
    endpoint: `https://${CLOUDFLARE_ACCOUNT_ID_PROFILE}.r2.cloudflarestorage.com`,
    accessKeyId: CLOUDFLARE_ACCESS_KEY_ID_PROFILE,
    secretAccessKey: CLOUDFLARE_SECRET_ACCESS_KEY_PROFILE,
    signatureVersion: 'v4',
    region: 'auto',
  });

  const supabaseUrl = 'https://qlhoipsilplgtfcpbrpr.supabase.co';
  // Use the anon key - RLS policies will handle security
  const supabaseKey =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFsaG9pcHNpbHBsZ3RmY3BicnByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDExNzg0NzMsImV4cCI6MjA1Njc1NDQ3M30.e4UlDKIAJ4SAPuOwgPFoZQNiVlD7JZIgn73yQVAX6LE';
  const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

  let loggedInUserId = null;
  let currentProfileData = null;

  // --- UI Elements ---
  const nameDisplay = document.getElementById('restaurant-name-display');
  const phoneDisplay = document.getElementById('phone-number-display');
  const logoDisplay = document.getElementById('logo-display');
  const editNameBtn = document.getElementById('edit-name-btn');
  const editPhoneBtn = document.getElementById('edit-phone-btn');
  const editLogoBtn = document.getElementById('edit-logo-btn');
  // Input fields and edit sections
  const nameDisplaySection = document.getElementById('name-display-section');
  const nameEditSection = document.getElementById('name-edit-section');
  const nameInput = document.getElementById('restaurant-name-input');
  const saveNameBtn = document.getElementById('save-name-btn');
  const cancelNameBtn = document.getElementById('cancel-name-btn');

  const phoneDisplaySection = document.getElementById('phone-display-section');
  const phoneEditSection = document.getElementById('phone-edit-section');
  const phoneInput = document.getElementById('phone-number-input');
  const savePhoneBtn = document.getElementById('save-phone-btn');
  const cancelPhoneBtn = document.getElementById('cancel-phone-btn');

  const logoDisplaySection = document.getElementById('logo-display-section');
  const logoEditSection = document.getElementById('logo-edit-section');
  const logoInput = document.getElementById('logo-input');
  const saveLogoBtn = document.getElementById('save-logo-btn');
  const cancelLogoBtn = document.getElementById('cancel-logo-btn');

  // --- Helper Functions ---
  function handleError(error, message) {
    console.error(`${message}:`, error);
    // Basic alert for now, can be improved with toast notifications like in script.js
    alert(`Error: ${message}. ${error.message || ''}. Check console.`);
  }

  function getLogoPublicUrl(filePath) {
    if (!filePath) {
      return 'placeholder.png'; // Default placeholder
    }
    // Construct the public URL for the image in Cloudflare R2
    return `${CLOUDFLARE_PUBLIC_BASE_URL_PROFILE}/${filePath}`;
  }

  // --- Data Fetching & Updating ---
  async function getUser() {
    const {
      data: { session },
      error,
    } = await supabaseClient.auth.getSession();
    if (error) {
      handleError(error, 'Failed to get user session');
      return null;
    }
    if (!session?.user) {
      console.log('User not logged in.');
      // Redirect to login page or show message
      window.location.href = 'auth.html'; // Redirect if not logged in
      return null;
    }
    console.log('User session found:', session.user);
    loggedInUserId = session.user.id;
    return session.user;
  }

  async function fetchProfile(userId) {
    if (!userId) return null;
    try {
      const { data, error, status } = await supabaseClient
        .from('profiles')
        .select(`restaurant_name, phone_number, logo_url`)
        .eq('id', userId)
        .single(); // We expect only one profile per user

      if (error && status !== 406) {
        // 406 means no row found, which is okay initially
        throw error;
      }
      // This block should be inside the try
      if (data) {
        console.log('Profile data fetched:', data);
        currentProfileData = data;
        return data;
      } else {
        console.log('No profile found for user, using defaults.');
        currentProfileData = {
          restaurant_name: '',
          phone_number: '',
          logo_url: null,
        }; // Default empty profile
        return currentProfileData;
      }
    } catch (error) {
      // Catch block for fetchProfile
      handleError(error, 'Failed to fetch profile data');
      return null;
    }
  } // End of fetchProfile function

  // Define updateProfile OUTSIDE fetchProfile
  async function updateProfile(updates) {
    if (!loggedInUserId) {
      handleError(new Error('User not logged in'), 'Update failed');
      return false;
    }
    if (Object.keys(updates).length === 0) {
      console.log('No updates to save.');
      return true; // Nothing to update
    }

    try {
      // Add the updated_at timestamp automatically if not using the trigger
      // updates.updated_at = new Date();

      // Use upsert to handle both insert and update cases
      const { data, error } = await supabaseClient
        .from('profiles')
        .upsert({ id: loggedInUserId, ...updates }) // Include the id for upsert
        .select() // Select the upserted row to confirm
        .single(); // Expecting one row back after upsert

      if (error) throw error;

      console.log('Profile updated successfully:', data);
      // Update local cache
      currentProfileData = { ...currentProfileData, ...data };
      return true;
    } catch (error) {
      handleError(error, 'Failed to update profile');
      return false;
    }
  } // End of updateProfile function

  // Define uploadLogo OUTSIDE fetchProfile
  async function uploadLogo(file) {
    if (!file) {
      handleError(new Error('No file selected'), 'Logo upload failed');
      return null;
    }
    if (!loggedInUserId) {
      handleError(new Error('User not logged in'), 'Logo upload failed');
      return null;
    }

    // --- Image Validation ---
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const maxSize = 2 * 1024 * 1024; // 2 MB

    if (!allowedTypes.includes(file.type)) {
      handleError(
        new Error('Invalid image type'),
        'Logo upload failed: Only JPG, PNG, WEBP are allowed.',
      );
      return null;
    }
    if (file.size > maxSize) {
      handleError(
        new Error('Image file size exceeds 2MB limit'),
        'Logo upload failed.',
      );
      return null;
    }

    // Create a unique path, e.g., profile-logos/user_id.extension
    const fileExt = file.name.split('.').pop();
    const filePath = `profile-logos/${loggedInUserId}.${fileExt}`; // Overwrite previous logo for the user

    try {
      console.log(`Uploading logo to R2 path: ${filePath}`);

      const uploadParams = {
        Bucket: CLOUDFLARE_BUCKET_NAME_PROFILE,
        Key: filePath,
        Body: file,
        ContentType: file.type,
      };

      const uploadResult = await r2ClientProfile.upload(uploadParams).promise();

      if (!uploadResult || !uploadResult.Key) {
        throw new Error('Logo upload to R2 failed: No key returned.');
      }
      console.log('Logo uploaded successfully to R2, path:', uploadResult.Key);
      return uploadResult.Key; // R2 returns the Key (filePath)
    } catch (error) {
      handleError(error, 'Logo upload failed');
      return null;
    }
  } // End of uploadLogo function
  // End of uploadLogo function (Removed extra closing brace here)

  // --- Update UI ---
  function displayProfileData(profile) {
    if (!profile) return;
    nameDisplay.textContent = profile.restaurant_name || '[Not Set]';
    phoneDisplay.textContent = profile.phone_number || '[Not Set]';
    logoDisplay.src = getLogoPublicUrl(profile.logo_url);
    logoDisplay.alt = profile.restaurant_name
      ? `${profile.restaurant_name} Logo`
      : 'Restaurant Logo';
  }

  // --- Edit Mode Toggling ---
  function toggleEditMode(
    displaySection,
    editSection,
    inputElement,
    isEditing,
  ) {
    if (isEditing) {
      // Populate input with current data before showing
      if (inputElement.type !== 'file') {
        // Get current text content, handle "[Not Set]" or "[Loading...]"
        const currentText =
          displaySection.querySelector('span, img').textContent ||
          displaySection.querySelector('span, img').alt;
        if (!currentText.startsWith('[')) {
          // Don't populate if it's a placeholder
          inputElement.value = currentText;
        } else {
          inputElement.value = ''; // Clear if it was a placeholder
        }
      } else {
        inputElement.value = null; // Clear file input
      }
      displaySection.classList.add('hidden');
      editSection.style.display = 'flex'; // Use flex to show
    } else {
      displaySection.classList.remove('hidden');
      editSection.style.display = 'none'; // Hide edit form
    }
  }

  // --- Setup Event Listeners ---
  function setupEditListeners() {
    // Name Edit/Cancel
    editNameBtn?.addEventListener('click', () => {
      toggleEditMode(nameDisplaySection, nameEditSection, nameInput, true);
    });
    cancelNameBtn?.addEventListener('click', () => {
      toggleEditMode(nameDisplaySection, nameEditSection, nameInput, false);
    });

    // Phone Edit/Cancel
    editPhoneBtn?.addEventListener('click', () => {
      toggleEditMode(phoneDisplaySection, phoneEditSection, phoneInput, true);
    });
    cancelPhoneBtn?.addEventListener('click', () => {
      toggleEditMode(phoneDisplaySection, phoneEditSection, phoneInput, false);
    });

    // Logo Edit/Cancel
    editLogoBtn?.addEventListener('click', () => {
      toggleEditMode(logoDisplaySection, logoEditSection, logoInput, true);
    });
    cancelLogoBtn?.addEventListener('click', () => {
      toggleEditMode(logoDisplaySection, logoEditSection, logoInput, false);
    });

    // --- Save Button Listeners ---
    saveNameBtn?.addEventListener('click', async () => {
      const newName = nameInput.value.trim();
      console.log('Save Name clicked. Value:', newName);
      saveNameBtn.disabled = true; // Disable button during save
      saveNameBtn.textContent = 'Saving...';

      const success = await updateProfile({ restaurant_name: newName });

      saveNameBtn.disabled = false; // Re-enable button
      saveNameBtn.textContent = 'Save';

      if (success) {
        nameDisplay.textContent = newName || '[Not Set]'; // Update display
        toggleEditMode(nameDisplaySection, nameEditSection, nameInput, false); // Switch back
        // showToast("Restaurant name updated!"); // Optional: Add toast notifications
      } else {
        // Error handled in updateProfile
        // Maybe revert input value?
        // nameInput.value = currentProfileData.restaurant_name || '';
      }
    });

    savePhoneBtn?.addEventListener('click', async () => {
      const newPhone = phoneInput.value.trim();
      console.log('Save Phone clicked. Value:', newPhone);
      savePhoneBtn.disabled = true;
      savePhoneBtn.textContent = 'Saving...';

      const success = await updateProfile({ phone_number: newPhone });

      savePhoneBtn.disabled = false;
      savePhoneBtn.textContent = 'Save';

      if (success) {
        phoneDisplay.textContent = newPhone || '[Not Set]';
        toggleEditMode(
          phoneDisplaySection,
          phoneEditSection,
          phoneInput,
          false,
        );
        // showToast("Phone number updated!");
      } else {
        // phoneInput.value = currentProfileData.phone_number || '';
      }
    });

    saveLogoBtn?.addEventListener('click', async () => {
      const file = logoInput.files[0];
      console.log('Save Logo clicked. File:', file);
      if (!file) {
        alert('Please select an image file first.');
        return;
      }

      saveLogoBtn.disabled = true;
      saveLogoBtn.textContent = 'Uploading...';

      const logoPath = await uploadLogo(file); // Upload first

      if (logoPath) {
        saveLogoBtn.textContent = 'Saving...';
        const success = await updateProfile({ logo_url: logoPath }); // Then update profile URL

        if (success) {
          logoDisplay.src = getLogoPublicUrl(logoPath); // Update display
          toggleEditMode(logoDisplaySection, logoEditSection, logoInput, false);
          // showToast("Logo updated!");
        }
        // Error handled in updateProfile if DB update fails
      }
      // Error handled in uploadLogo if upload fails

      saveLogoBtn.disabled = false;
      saveLogoBtn.textContent = 'Save';
    });
  }

  // --- Initialization ---
  async function initializeProfilePage() {
    const user = await getUser();
    if (user) {
      const profile = await fetchProfile(user.id);
      if (profile) {
        displayProfileData(profile);
      } else {
        // Handle case where profile couldn't be fetched but user exists
        nameDisplay.textContent = '[Error Loading Profile]';
        phoneDisplay.textContent = '[Error Loading Profile]';
      }
      setupEditListeners(); // Setup listeners after data is potentially loaded
    }
    // If no user, redirection should have happened in getUser()
  }

  initializeProfilePage();
}); // End DOMContentLoaded
