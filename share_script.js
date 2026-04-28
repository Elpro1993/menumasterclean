// Ensure Supabase client is loaded from CDN first
if (typeof supabase === 'undefined' || !supabase.createClient) {
  console.error(
    'Supabase client library not loaded from CDN. Aborting script execution.',
  );
  document.body.innerHTML =
    '<h1 style="color:red;">Error: Supabase library failed to load. Please check the network connection and CDN link.</h1>';
} else {
  const supabaseUrl = 'https://qlhoipsilplgtfcpbrpr.supabase.co';
  const supabaseKey =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFsaG9pcHNpbHBsZ3RmY3BicnByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDExNzg0NzMsImV4cCI6MjA1Njc1NDQ3M30.e4UlDKIAJ4SAPuOwgPFoZQNiVlD7JZIgn73yQVAX6LE';
  const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
  let currentMenuItems = []; // Holds the current menu items fetched from DB
  let currentCategories = []; // Holds the current categories fetched from DB
  let ownerUserId = null; // Holds the ID of the owner whose menu is being displayed
  let isMenuItemOrderIndexSupported = true; // Assume supported by default
  let currentLanguage = 'en';

  const translations = {
    en: {
      all: 'All',
      noItemsInCategory: 'No items found in this category.',
      unnamedItem: 'Unnamed Item',
      noDescription: 'No description available.',
      restaurantMenu: 'Restaurant Menu',
    },
    ar: {
      all: 'الكل',
      noItemsInCategory: 'لا توجد أصناف في هذه الفئة.',
      unnamedItem: 'صنف بدون اسم',
      noDescription: 'لا يوجد وصف.',
      restaurantMenu: 'قائمة المطعم',
    },
  };

  function t(key) {
    return translations[currentLanguage]?.[key] || translations.en[key] || key;
  }

  function getCategoryDisplayName(category) {
    if (currentLanguage === 'ar' && category?.name_ar) return category.name_ar;
    return category?.name || '';
  }

  function getItemDisplayName(item) {
    if (currentLanguage === 'ar' && item?.name_ar) return item.name_ar;
    return item?.name || t('unnamedItem');
  }

  function getItemDisplayDescription(item) {
    if (currentLanguage === 'ar' && item?.description_ar)
      return item.description_ar;
    return item?.description || t('noDescription');
  }

  function applyLanguageUi() {
    const languageToggleBtn = document.getElementById('language-toggle-btn');
    if (languageToggleBtn) {
      languageToggleBtn.textContent = currentLanguage === 'en' ? 'AR' : 'EN';
    }
    const allBtn = document.querySelector('.category-btn[data-category-key="All"]');
    if (allBtn) allBtn.textContent = t('all');
    document.documentElement.lang = currentLanguage === 'ar' ? 'ar' : 'en';
  }

  // Centralized error handling
  function handleError(error, message) {
    console.error(`${message}:`, error);
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = `Error: ${message}. ${error.message || ''}. Check console.`;
    const existingError = document.querySelector('.error-message');
    if (!existingError) {
      document.body.prepend(errorDiv);
      setTimeout(() => errorDiv.remove(), 5000);
    }
    return [];
  }

  // Toast notification (optional for share page, but can be useful for errors)
  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  // Cloudflare R2 Configuration for menu-item-images
  const CLOUDFLARE_ACCOUNT_ID_MENU = 'bf2a9e62933c4a2fb5ead76575f17def';
  const CLOUDFLARE_ACCESS_KEY_ID_MENU = 'ce2cc917d1b6d104718abaaa0cbe2ec9';
  const CLOUDFLARE_SECRET_ACCESS_KEY_MENU =
    '44e32ecead692a2044044f3007d63419804e8bca1d4afc09f5a890f7ed785c54';
  const CLOUDFLARE_BUCKET_NAME_MENU = 'menu-item-images';
  const CLOUDFLARE_PUBLIC_BASE_URL_MENU =
    'https://pub-8b8ab21771d24bc2957d570bae574393.r2.dev';

  // Helper function to get public URL for an image path
  function getImagePublicUrl(filePath) {
    if (!filePath) {
      return 'placeholder.png'; // Return placeholder if no path
    }
    // Construct the public URL for the image in Cloudflare R2
    return `${CLOUDFLARE_PUBLIC_BASE_URL_MENU}/${filePath}`;
  }

  // Helper function to get public URL for a profile logo path
  function getProfileLogoPublicUrl(filePath) {
    if (!filePath) {
      return 'placeholder-logo.png'; // Return a different placeholder for logo if needed
    }
    // Construct the public URL for the image in Cloudflare R2
    return `${CLOUDFLARE_PUBLIC_BASE_URL_MENU}/${filePath}`;
  }

  // --- Data Fetching Functions (Modified for Owner ID) ---
  async function getCategories(userId) {
    if (!userId)
      return handleError(
        new Error('Owner User ID is missing'),
        'Cannot load categories',
      );
    console.log(`Fetching categories for user: ${userId}...`);
    const { data, error } = await supabaseClient
      .from('categories')
      .select('*')
      .eq('user_id', userId) // Filter by provided user ID
      .order('order_index', { ascending: true, nullsFirst: true }) // Order by order_index first
      .order('name', { ascending: true }); // Fallback order by name

    if (error) return handleError(error, 'Failed to load categories');

    console.log('Categories fetched:', data);
    return data || [];
  }

  async function getMenuItems(userId) {
    if (!userId)
      return handleError(
        new Error('Owner User ID is missing'),
        'Cannot load menu items',
      );
    console.log(`Fetching menu items for user: ${userId}...`);
    let query = supabaseClient
      .from('menu_items')
      .select('*')
      .eq('user_id', userId); // Filter by provided user ID

    // Try to order by order_index first
    const { data, error } = await query.order('order_index', {
      ascending: true,
      nullsFirst: true,
    });

    if (error) {
      if (error.code === '42703') {
        console.warn(
          '"order_index" column not found in "menu_items". Falling back to default order. Reordering will be disabled.',
        );
        isMenuItemOrderIndexSupported = false;
        // Retry query without order_index
        const { data: fallbackData, error: fallbackError } =
          await supabaseClient
            .from('menu_items')
            .select('*')
            .eq('user_id', userId);

        if (fallbackError) {
          return handleError(
            fallbackError,
            'Failed to load menu items (fallback)',
          );
        }
        return fallbackData || [];
      } else {
        return handleError(error, 'Failed to load menu items');
      }
    }
    return data || [];
  }

  // Fetch restaurant profile data (name, logo)
  async function getRestaurantProfile(userId) {
    if (!userId) {
      console.error('User ID is required to fetch restaurant profile.');
      return null;
    }
    console.log('Fetching restaurant profile for user:', userId);
    try {
      const { data, error, status } = await supabaseClient
        .from('profiles') // Assuming a 'profiles' table
        .select(
          'restaurant_name, logo_url, phone_number, area, background_color, item_color, item_name_color, item_price_color, item_description_color, cover_photo_url',
        ) // Select the relevant columns including colors
        .eq('id', userId) // Filter by the user's ID
        .single(); // Expect only one profile per user

      if (error && status !== 406) {
        // 406 means no rows found, which is handled below
        throw error;
      }

      if (data) {
        console.log('Restaurant profile fetched:', data);
        return data;
      } else {
        console.warn('No restaurant profile found for user:', userId);
        return null; // No profile found for this user
      }
    } catch (error) {
      return handleError(error, 'Failed to load restaurant profile');
    }
  }

  // --- DOM Manipulation Functions (Simplified for Display Only) ---
  function createMenuItemCard(item, profileColors = {}) {
    const card = document.createElement('div');
    card.className = 'menu-item'; // No 'editing' class needed
    card.dataset.itemId = item.id;
    // Use helper with Cloudflare R2 configuration (same as dashboard)
    const imageUrl = getImagePublicUrl(item.image);

    const itemNameStyle = profileColors.item_name_color
      ? `style="color: ${profileColors.item_name_color};"`
      : '';
    const itemPriceStyle = profileColors.item_price_color
      ? `style="color: ${profileColors.item_price_color};"`
      : '';
    const itemDescriptionStyle = profileColors.item_description_color
      ? `style="color: ${profileColors.item_description_color};"`
      : '';

    card.innerHTML = `
            <img src="${imageUrl}" alt="${getItemDisplayName(item)}" class="item-image" onerror="this.onerror=null;this.src='placeholder.png';">
            <div class="item-content">
                <h3 class="item-name" ${itemNameStyle}>${getItemDisplayName(item)}</h3>
                <div class="item-header">
                    <span class="item-price" ${itemPriceStyle}>${item.price ? '$' + parseFloat(item.price).toFixed(2) : 'N/A'}</span>
                </div>
                <p class="item-description" ${itemDescriptionStyle}>${getItemDisplayDescription(item)}</p>
                <div class="expand-indicator">
                    <i class="fas fa-chevron-down"></i>
                </div>
            </div>
           `;

    // Add click listener for expanding description
    card.addEventListener('click', (e) => {
      const descriptionElement = card.querySelector('.item-description');
      if (descriptionElement) {
        descriptionElement.classList.toggle('visible');
      }
      const indicator = card.querySelector('.expand-indicator i');
      if (indicator) {
        indicator.classList.toggle('fa-chevron-down');
        indicator.classList.toggle('fa-chevron-up');
      }
    });
    return card;
  }

  function filterMenuItems(category, menuItems, menuGrid, profileColors = {}) {
    if (!menuGrid) {
      console.error('Menu grid not found!');
      return;
    }
    menuGrid.innerHTML = '';
    const filteredItems =
      category === 'All'
        ? menuItems
        : menuItems.filter(
            (item) => item.category?.toLowerCase() === category.toLowerCase(),
          );

    console.log(
      `Filtering for category: ${category}, Items found: ${filteredItems.length}`,
    );

    if (filteredItems.length === 0) {
      menuGrid.innerHTML = `<p>${t('noItemsInCategory')}</p>`;
    } else {
      filteredItems.forEach((item) => {
        menuGrid.appendChild(createMenuItemCard(item, profileColors));
      });
    }
  }

  function addCategoriesToNav(
    categories,
    menuItems,
    menuGrid,
    profileColors = {},
  ) {
    const categoryScroll = document.querySelector(
      '.category-nav .category-scroll',
    );
    if (!categoryScroll) {
      console.error('Category scroll container not found!');
      return;
    }
    categoryScroll.innerHTML = ''; // Clear existing buttons

    // Add 'All' button
    const allButton = document.createElement('button');
    allButton.className = 'category-btn active';
    allButton.dataset.categoryKey = 'All';
    allButton.textContent = t('all');
    allButton.onclick = () => {
      document
        .querySelectorAll('.category-btn')
        .forEach((btn) => btn.classList.remove('active'));
      allButton.classList.add('active');
      filterMenuItems('All', menuItems, menuGrid, profileColors);
    };
    categoryScroll.appendChild(allButton);

    // Add buttons for each category
    categories.forEach((category) => {
      const categoryButton = document.createElement('button');
      categoryButton.className = 'category-btn';
      categoryButton.dataset.categoryKey = category.name;
      if (category.icon_enabled && category.icon_class) {
        const icon = document.createElement('i');
        icon.className = `fas ${category.icon_class}`;
        categoryButton.prepend(icon);
      }
      categoryButton.appendChild(
        document.createTextNode(getCategoryDisplayName(category)),
      );
      categoryButton.onclick = () => {
        document
          .querySelectorAll('.category-btn')
          .forEach((btn) => btn.classList.remove('active'));
        categoryButton.classList.add('active');
        filterMenuItems(category.name, menuItems, menuGrid, profileColors);
      };
      categoryScroll.appendChild(categoryButton);
    });
  }

  // --- Initialization ---
  document.addEventListener('DOMContentLoaded', async () => {
    console.log('Share script DOMContentLoaded started.');
    const menuGrid = document.querySelector('.menu-grid');
    const restaurantNameElement = document.getElementById('restaurant-name');
    const restaurantLogoElement = document.getElementById('restaurant-logo');
    const languageToggleBtn = document.getElementById('language-toggle-btn');
    applyLanguageUi();

    console.log('Elements selected:', {
      menuGrid,
      restaurantNameElement,
      restaurantLogoElement,
    });

    if (!menuGrid || !restaurantNameElement || !restaurantLogoElement) {
      console.error('Required elements not found on page load.');
      handleError(new Error('Required element missing.'), 'Page setup failed');
      return;
    }

    // Get owner ID from URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    ownerUserId = urlParams.get('user'); // Corrected parameter name to 'user'
    console.log('Owner User ID from URL:', ownerUserId);

    if (!ownerUserId) {
      console.error(
        'Owner ID not found in URL. Available parameters:',
        Object.fromEntries(urlParams),
      );
      menuGrid.innerHTML =
        '<p class="error-message">Error: No restaurant specified. Please ensure the link includes the user ID (?user=...).</p>';
      // Optionally hide category nav if no owner
      const categoryNav = document.querySelector('.category-nav');
      if (categoryNav) categoryNav.style.display = 'none';
      return;
    }

    console.log(`Loading menu for owner: ${ownerUserId}`);

    // Fetch and display restaurant profile info
    const profileData = await getRestaurantProfile(ownerUserId);
    console.log('Fetched profile data:', profileData);

    if (profileData) {
      restaurantNameElement.textContent =
        profileData.restaurant_name || t('restaurantMenu');

      // Apply fetched colors
      if (profileData.background_color) {
        document.body.style.backgroundColor = profileData.background_color;
      }
      if (profileData.cover_photo_url) {
        const coverPhotoElement = document.getElementById('cover-photo');
        if (coverPhotoElement) {
          coverPhotoElement.style.backgroundImage = `url('${getProfileLogoPublicUrl(
            profileData.cover_photo_url,
          )}')`;
        }
      }
      if (profileData.item_color) {
        // Need to wait for menu items to be rendered before applying item color
        // This will be handled after fetching menu items
      }

      if (profileData.logo_url) {
        const finalLogoUrl = getProfileLogoPublicUrl(profileData.logo_url);
        console.log('Constructed final logo URL:', finalLogoUrl);
        restaurantLogoElement.src = finalLogoUrl;
        restaurantLogoElement.alt = `${profileData.restaurant_name || 'Restaurant'} Logo`;
      } else {
        console.log('profileData.logo_url is missing, using placeholder.');
        restaurantLogoElement.src = 'placeholder-logo.png'; // Explicitly set placeholder
        restaurantLogoElement.alt = 'Restaurant Logo'; // Keep placeholder image src
      }
      const phoneNumberElement = document.getElementById(
        'restaurant-phone-number',
      );
      const areaElement = document.getElementById('restaurant-area');

      if (phoneNumberElement) {
        phoneNumberElement.textContent = profileData.phone_number || '';
        console.log(
          'Updated shared phone number to:',
          phoneNumberElement.textContent,
        );
      } else {
        console.error('Shared phone number element not found.');
      }

      if (areaElement) {
        areaElement.textContent = profileData.area || '';
        console.log('Updated shared area to:', areaElement.textContent);
      } else {
        console.error('Shared area element not found.');
      }
    } else {
      console.log('No profile data found.');
      restaurantNameElement.textContent = 'Restaurant Menu'; // Default name if profile fails
      restaurantNameElement.textContent = t('restaurantMenu');
      restaurantLogoElement.alt = 'Restaurant Logo'; // Keep placeholder image src
    }

    // Fetch data for the specific owner
    currentCategories = await getCategories(ownerUserId);
    currentMenuItems = await getMenuItems(ownerUserId);
    console.log('Fetched categories and menu items:', {
      categories: currentCategories,
      items: currentMenuItems,
    });

    // Populate the page
    addCategoriesToNav(
      currentCategories,
      currentMenuItems,
      menuGrid,
      profileData,
    );
    filterMenuItems('All', currentMenuItems, menuGrid, profileData); // Display 'All' items initially

    if (languageToggleBtn) {
      languageToggleBtn.addEventListener('click', () => {
        currentLanguage = currentLanguage === 'en' ? 'ar' : 'en';
        applyLanguageUi();
        addCategoriesToNav(
          currentCategories,
          currentMenuItems,
          menuGrid,
          profileData,
        );
        const activeCategoryButton = document.querySelector(
          '.category-nav .category-scroll .category-btn.active',
        );
        const activeCategory =
          activeCategoryButton?.dataset.categoryKey || 'All';
        filterMenuItems(
          activeCategory,
          currentMenuItems,
          menuGrid,
          profileData,
        );
      });
    }

    // Apply item color after menu items are rendered
    if (profileData && profileData.item_color) {
      document.querySelectorAll('.menu-item').forEach((item) => {
        item.style.backgroundColor = profileData.item_color;
      });
    }
    if (profileData && profileData.item_description_color) {
      document
        .querySelectorAll('.item-description')
        .forEach((descriptionElement) => {
          descriptionElement.style.color = profileData.item_description_color;
        });
    }
    console.log('Share script DOMContentLoaded finished.');
  });
}
