// Ensure Supabase client is loaded from CDN first
if (typeof supabase === 'undefined' || !supabase.createClient) {
  console.error(
    'Supabase client library not loaded from CDN. Aborting script execution.',
  );
  document.body.innerHTML =
    '<h1 style="color:red;">Error: Supabase library failed to load. Please check the network connection and CDN link.</h1>';
  // throw new Error("Supabase client library not loaded."); // Optionally stop execution
} else {
  console.log('DEBUG: script.js has started execution.'); // More prominent log
  // Import S3 client from AWS SDK
  const { S3 } = AWS;

  // Cloudflare R2 Configuration for menu-item-images
  const CLOUDFLARE_ACCOUNT_ID_MENU = 'bf2a9e62933c4a2fb5ead76575f17def';
  const CLOUDFLARE_ACCESS_KEY_ID_MENU = 'ce2cc917d1b6d104718abaaa0cbe2ec9';
  const CLOUDFLARE_SECRET_ACCESS_KEY_MENU =
    '44e32ecead692a2044044f3007d63419804e8bca1d4afc09f5a890f7ed785c54';
  const CLOUDFLARE_BUCKET_NAME_MENU = 'menu-item-images';
  const CLOUDFLARE_PUBLIC_BASE_URL_MENU =
    'https://pub-8b8ab21771d24bc2957d570bae574393.r2.dev';

  const r2ClientMenu = new S3({
    endpoint: `https://${CLOUDFLARE_ACCOUNT_ID_MENU}.r2.cloudflarestorage.com`,
    accessKeyId: CLOUDFLARE_ACCESS_KEY_ID_MENU,
    secretAccessKey: CLOUDFLARE_SECRET_ACCESS_KEY_MENU,
    signatureVersion: 'v4',
    region: 'auto',
  });

  const supabaseUrl = 'https://qlhoipsilplgtfcpbrpr.supabase.co';
  const supabaseKey =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFsaG9pcHNpbHBsZ3RmY3BicnByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDExNzg0NzMsImV4cCI6MjA1Njc1NDQ3M30.e4UlDKIAJ4SAPuOwgPFoZQNiVlD7JZIgn73yQVAX6LE';
  const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
  let currentMenuItems = []; // Holds the current menu items fetched from DB
  let currentCategories = []; // Holds the current categories fetched from DB
  let currentCurrencies = []; // Holds the current currencies fetched from DB
  let isEditMode = false; // Tracks if the dashboard is in item editing mode
  let isCategoryEditMode = false; // Tracks if categories are in edit/rearrange mode
  let isOrderIndexSupported = true; // Assume supported by default
  let isMenuItemOrderIndexSupported = true; // Assume supported by default
  let loggedInUserId = null; // Holds the ID of the currently logged-in user
  let menuItemsSortable = null; // Holds the Sortable instance for menu items

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

  // Toast notification
  function showToast(message, duration = 2000) {
    // Added duration parameter
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    console.log('Toast element appended:', toast);
    if (duration > 0) {
      setTimeout(() => {
        console.log('Removing toast element:', toast);
        toast.remove();
      }, duration);
    }
  }

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

  // --- Data Fetching Functions ---
  async function getCategories() {
    console.log('Fetching categories...');
    let query = supabaseClient
      .from('categories')
      .select('*')
      .eq('user_id', loggedInUserId);

    // Try to order by order_index first
    const { data, error } = await query
      .order('order_index', { ascending: true, nullsFirst: true })
      .order('name', { ascending: true });

    if (error) {
      // 42703: undefined_column
      if (error.code === '42703') {
        console.warn(
          '"order_index" column not found in "categories". Falling back to ordering by name. Reordering will be disabled.',
        );
        isOrderIndexSupported = false;
        // Retry query without order_index
        const { data: fallbackData, error: fallbackError } =
          await supabaseClient
            .from('categories')
            .select('*')
            .eq('user_id', loggedInUserId)
            .order('name', { ascending: true });

        if (fallbackError) {
          return handleError(
            fallbackError,
            'Failed to load categories (fallback)',
          );
        }
        return fallbackData || [];
      } else if (error.code !== '42501') {
        // Ignore RLS errors if user is not logged in
        return handleError(error, 'Failed to load categories');
      }
    }
    return data || [];
  }

  async function getMenuItems() {
    console.log('Fetching menu items...');
    let query = supabaseClient
      .from('menu_items')
      .select('*')
      .eq('user_id', loggedInUserId); // Filter by logged-in user

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
            .eq('user_id', loggedInUserId);

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

  async function updateMenuItemOrder(event) {
    console.log('updateMenuItemOrder called', event);
    const itemElements = Array.from(
      document.querySelector('.menu-grid').children,
    );
    const updates = itemElements.map((item, index) => {
      return {
        id: item.dataset.itemId,
        order_index: index,
      };
    });
    console.log('updates', updates);

    try {
      const updatePromises = updates.map((update) =>
        supabaseClient
          .from('menu_items')
          .update({ order_index: update.order_index })
          .eq('id', update.id),
      );
      const results = await Promise.all(updatePromises);
      results.forEach((result) => {
        if (result.error) throw result.error;
      });

      // Update currentMenuItems locally to reflect the new order
      const newOrderedItems = itemElements.map((itemElement) => {
        const itemId = itemElement.dataset.itemId;
        return currentMenuItems.find((item) => item.id === itemId);
      });
      currentMenuItems = newOrderedItems.filter(Boolean); // Filter out any undefined items

      showToast('Item order saved!');
    } catch (error) {
      handleError(error, 'Failed to save item order');
    }
  }

  async function getCurrencies() {
    console.log('Fetching currencies...');
    const { data, error } = await supabaseClient
      .from('currencies')
      .select('*')
      .order('code', { ascending: true });

    if (error) {
      return handleError(error, 'Failed to load currencies');
    }
    console.log('Currencies fetched:', data);
    return data || [];
  }

  async function getUserProfile(userId) {
    console.log('Fetching user profile for user ID:', userId);
    const { data, error } = await supabaseClient
      .from('profiles')
      .select(
        'restaurant_name, logo_url, phone_number, area, background_color, item_color, item_name_color, item_price_color, item_description_color, cover_photo_url',
      ) // Select the required fields including new colors
      .eq('id', userId) // Filter by user ID
      .single(); // Expecting a single profile per user

    if (error) {
      handleError(error, `Failed to load user profile for user ID: ${userId}`);
      return null;
    }

    console.log('User profile fetched:', data);
    return data;
  }

  // Function to update user profile (phone and area)
  async function updateUserProfile(updates) {
    if (!loggedInUserId) {
      handleError(new Error('User not logged in'), 'Profile update failed');
      return false;
    }
    if (Object.keys(updates).length === 0) {
      console.log('No updates to save.');
      return true; // Nothing to update
    }

    try {
      console.log('Attempting to update profile in DB:', updates);
      const { data, error } = await supabaseClient
        .from('profiles')
        .update(updates) // Use update for existing row
        .eq('id', loggedInUserId) // Filter by user ID
        .select() // Select the updated row to confirm
        .single(); // Expecting one row back

      if (error) throw error;

      console.log('Profile updated successfully:', data);
      // Note: We don't need to update a local currentProfileData here
      // as we re-fetch it when opening the modal.
      return true;
    } catch (error) {
      handleError(error, 'Failed to update profile');
      return false;
    }
  }

  // --- DOM Manipulation Functions ---
  function createMenuItemCard(item, inEditMode = false, categories = []) {
    // Add inEditMode and categories parameters
    const card = document.createElement('div');
    card.className = `menu-item ${inEditMode ? 'editing' : ''}`; // Add 'editing' class if in edit mode
    card.dataset.itemId = item.id; // Store item ID for reference
    const imageUrl = getImagePublicUrl(item.image); // Use helper function

    if (inEditMode) {
      // Render editable fields
      const categoryOptions = categories
        .map(
          (cat) =>
            `<option value="${cat.name}" ${item.category === cat.name ? 'selected' : ''}>${cat.name}</option>`,
        )
        .join('');

      card.innerHTML = `
                <div class="item-image-edit-container">
                     <img src="${imageUrl}" alt="Current ${item.name}" class="item-image current-image-preview" onerror="this.onerror=null;this.src='placeholder.png';">
                     <label for="edit-image-${item.id}">Change Image:</label>
                     <input type="file" id="edit-image-${item.id}" name="edit-image" accept="image/*" class="edit-image-input">
                </div>
                <div class="item-content">
                    <div class="item-header">
                        <input type="text" class="edit-name-input" value="${item.name || ''}" placeholder="Item Name" required>
                        <input type="number" class="edit-price-input" value="${item.price ? (item.price % 1 === 0 ? item.price : parseFloat(item.price).toFixed(2)) : ''}" step="0.01" placeholder="Price" required>
                        <select class="edit-currency-select" required>
                            ${currentCurrencies.map((c) => `<option value="${c.id}" ${item.currency_id === c.id ? 'selected' : ''}>${c.code} (${c.symbol})</option>`).join('')}
                        </select>
                    </div>
                     <select class="edit-category-select" required>
                        ${categoryOptions.length > 0 ? categoryOptions : '<option value="">-- No Categories --</option>'}
                    </select>
                    <textarea class="edit-description-textarea" placeholder="Description">${item.description || ''}</textarea>
                    <div class="edit-actions">
                        <button class="save-item-btn">Save</button>
                        <button class="cancel-edit-btn">Cancel</button>
                    </div>
                    <div class="delete-item-container">
                        <i class="fas fa-trash-alt delete-item-btn" title="Delete item"></i>
                    </div>
                </div>
            `;

      // Add event listeners for Save/Cancel (implementation later)
      card
        .querySelector('.save-item-btn')
        .addEventListener('click', () => handleSaveItem(card, item.id));
      card
        .querySelector('.cancel-edit-btn')
        .addEventListener('click', () => handleCancelEdit(card, item));

      // Add delete button handler
      card
        .querySelector('.delete-item-btn')
        .addEventListener('click', async () => {
          const itemId = card.dataset.itemId;
          const confirmDelete = confirm(
            'Are you sure you want to delete this item?',
          );
          if (!confirmDelete) return;

          const index = currentMenuItems.findIndex(
            (item) => item.id === itemId,
          );
          if (index === -1) return;

          const success = await deleteMenuItem(index, currentMenuItems);
          if (success) {
            // Menu grid will be refreshed by deleteMenuItem's filterMenuItems call
          }
        });
    } else {
      // Render display fields (original logic)
      card.innerHTML = `
<img src="${imageUrl}?width=300&height=180&quality=80&format=webp" 
     srcset="${imageUrl}?width=600&quality=80&format=webp 2x"
     alt="${item.name}" 
     class="item-image" 
     loading="lazy" 
     width="300" 
     height="180"
     onerror="this.onerror=null;this.src='placeholder.png';">
                <div class="item-content">
                    <h3 class="item-name">${item.name || 'Unnamed Item'}</h3>
                    <div class="item-header">
                        <span class="item-price">${currentCurrencies.find((c) => c.id === item.currency_id)?.symbol || '$'}${item.price ? (item.price % 1 === 0 ? item.price : parseFloat(item.price).toFixed(2)) : 'N/A'}</span>
                    </div>
                    <p class="item-description">${item.description || 'No description available.'}</p>
                    <div class="expand-indicator">
                        <i class="fas fa-chevron-down"></i>
                    </div>
                </div>
               `;

      // Add click listener for expanding description (only in non-edit mode)
      card.addEventListener('click', (e) => {
        // Prevent toggling if clicking on interactive elements (like future edit buttons if added here)
        if (e.target.closest('button')) return;

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
    }
    return card;
  }

  function filterMenuItems(
    category,
    menuItems,
    menuGrid,
    forceEditMode = false,
    categories = [],
  ) {
    // Add categories parameter
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
      menuGrid.innerHTML = '<p>No items found in this category.</p>';
    } else {
      filteredItems.forEach((item) => {
        // Pass the edit mode state to the card creation function
        // Pass the edit mode state and categories to the card creation function
        menuGrid.appendChild(
          createMenuItemCard(item, forceEditMode, categories),
        );
      });
    }
  }

  async function addCategoriesToNav(categories, currentMenuItems, menuGrid) {
    const categoryScroll = document.querySelector(
      '.category-nav .category-scroll',
    );
    if (!categoryScroll) {
      console.error('Category scroll container not found!');
      return;
    }
    console.log('addCategoriesToNav received categories:', categories); // Debugging line
    // Check if Sortable is already initialized and destroy it before re-rendering
    const sortableInstance = Sortable.get(categoryScroll);
    if (sortableInstance) {
      sortableInstance.destroy();
      console.log('Destroyed existing Sortable instance.');
    }
    categoryScroll.innerHTML = '';

    if (isOrderIndexSupported) {
      // Create and append the "Edit Categories" button
      const editCategoriesBtn = document.createElement('button');
      editCategoriesBtn.className = 'action-btn';
      editCategoriesBtn.id = 'edit-categories-toggle-btn';
      editCategoriesBtn.style.backgroundColor = isCategoryEditMode
        ? '#4CAF50'
        : '#6c757d'; // Green if in edit mode, else grey
      editCategoriesBtn.style.marginRight = '10px';
      editCategoriesBtn.innerHTML = `<i class="fas ${
        isCategoryEditMode ? 'fa-check' : 'fa-edit'
      }"></i>`; // Check icon if in edit mode, else edit icon
      categoryScroll.appendChild(editCategoriesBtn);

      editCategoriesBtn.onclick = async () => {
        // Made the onclick handler async
        isCategoryEditMode = !isCategoryEditMode; // Toggle edit mode

        // Re-render items to reflect the change in edit mode status
        filterMenuItems(
          document.querySelector('.category-btn.active')?.textContent || 'All',
          currentMenuItems,
          menuGrid,
          isEditMode,
          currentCategories,
        ); // Re-filter items

        if (isCategoryEditMode) {
          // If entering edit mode, re-render categories to enable dragging/floating
          await addCategoriesToNav(
            currentCategories,
            currentMenuItems,
            menuGrid,
          );
        } else {
          // If exiting edit mode, save the new order
          const orderedCategoryButtons = Array.from(
            categoryScroll.querySelectorAll('.category-btn[data-category-id]'),
          );
          const updates = orderedCategoryButtons.map((btn, index) => {
            const categoryId = btn.dataset.categoryId;
            const category = currentCategories.find((c) => c.id === categoryId);
            return {
              id: categoryId,
              name: category ? category.name : null, // Include name to satisfy NOT NULL constraint
              order_index: index,
            };
          });

          if (updates.length > 0) {
            try {
              // Use upsert with all required columns (id, name, order_index)
              const { error } = await supabaseClient
                .from('categories')
                .upsert(updates, { onConflict: 'id' });
              if (error) throw error;
              // showToast('Category order saved!'); // Removed toast to avoid confusion when no change is made

              // 1. Update currentCategories locally with the new order
              currentCategories = currentCategories
                .map((cat) => {
                  const update = updates.find((u) => u.id === cat.id);
                  if (update) {
                    return { ...cat, order_index: update.order_index };
                  }
                  return cat;
                })
                .sort((a, b) => {
                  // Sort by order_index, handling nulls (nullsFirst: true is handled by DB, but we need local sort)
                  if (a.order_index === null)
                    return b.order_index === null ? 0 : -1;
                  if (b.order_index === null) return 1;
                  return a.order_index - b.order_index;
                });

              // 2. Re-render categories to show the newly saved order
              await addCategoriesToNav(
                currentCategories,
                currentMenuItems,
                menuGrid,
              );
            } catch (error) {
              handleError(error, 'Failed to save category order');
            }
          }
        }
      };
    }

    const allButton = document.createElement('button');
    allButton.className = 'category-btn active';
    allButton.textContent = 'All';
    allButton.onclick = () => {
      document
        .querySelectorAll('.category-btn')
        .forEach((btn) => btn.classList.remove('active'));
      allButton.classList.add('active');
      filterMenuItems(
        'All',
        currentMenuItems,
        menuGrid,
        isEditMode,
        currentCategories,
      ); // Pass edit mode state and categories
    };
    categoryScroll.appendChild(allButton);

    categories.forEach((category) => {
      const categoryButton = document.createElement('button');
      categoryButton.className = 'category-btn';
      categoryButton.textContent = category.name; // Set initial text content
      categoryButton.dataset.categoryId = category.id; // Store category ID for drag-and-drop

      if (category.icon_enabled && category.icon_class) {
        const icon = document.createElement('i');
        icon.className = `fas ${category.icon_class}`;
        categoryButton.prepend(icon);
      }

      if (isCategoryEditMode) {
        categoryButton.classList.add('draggable'); // Add a class for styling draggable items
      }

      categoryButton.onclick = (e) => {
        // Only trigger category filter if not clicking the delete icon or in category edit mode
        if (
          !e.target.classList.contains('delete-category-icon') &&
          !isCategoryEditMode
        ) {
          document
            .querySelectorAll('.category-btn')
            .forEach((btn) => btn.classList.remove('active'));
          categoryButton.classList.add('active');
          filterMenuItems(
            category.name,
            currentMenuItems,
            menuGrid,
            isEditMode,
            currentCategories,
          );
        }
      };

      // Add delete icon for categories (not for "All") only if in edit mode
      if (isCategoryEditMode && category.name !== 'All') {
        // Use isCategoryEditMode here
        const deleteIcon = document.createElement('i');
        deleteIcon.className = 'fas fa-trash-alt delete-category-icon';
        deleteIcon.title = `Delete category: ${category.name}`;
        deleteIcon.onclick = (e) => {
          e.stopPropagation(); // Prevent category button click
          handleDeleteCategory(category.id, category.name);
        };
        categoryButton.appendChild(deleteIcon); // Append icon directly to the button
      }

      categoryScroll.appendChild(categoryButton); // Append the button directly
    });

    if (isCategoryEditMode && isOrderIndexSupported) {
      new Sortable(categoryScroll, {
        animation: 300, // Increased animation duration for better visual feedback
        delay: 200, // Add a delay to allow scrolling without triggering drag
        touchStartThreshold: 5, // Ensure dragging starts only after a slight movement
        draggable: '.category-btn.draggable', // Only allow dragging of elements with this class
        filter: '.action-btn', // Only filter out the edit button
      });
    }
  }

  function populateCategoryDropdown(
    selectElement,
    categories,
    selectedValue = null,
  ) {
    if (!selectElement) {
      console.error(
        'Dropdown select element not found for population:',
        selectElement,
      );
      return;
    }
    const currentVal = selectElement.value;
    selectElement.innerHTML = '';

    if (categories.length === 0) {
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = '-- No Categories Available --';
      selectElement.appendChild(defaultOption);
      return;
    }

    categories.forEach((cat) => {
      const option = document.createElement('option');
      option.value = cat.name;
      option.textContent = cat.name;
      if (
        (selectedValue && cat.name === selectedValue) ||
        (!selectedValue && cat.name === currentVal)
      ) {
        option.selected = true;
      }
      selectElement.appendChild(option);
    });
  }

  function populateCurrencyDropdown(
    selectElement,
    currencies,
    selectedCurrencyId = null,
  ) {
    console.log(
      'populateCurrencyDropdown called with selectElement:',
      selectElement,
      'currencies:',
      currencies,
      'selectedCurrencyId:',
      selectedCurrencyId,
    );
    if (!selectElement) {
      console.error(
        'Currency dropdown select element not found for population:',
        selectElement,
      );
      return;
    }
    selectElement.innerHTML = ''; // Clear existing options

    if (currencies.length === 0) {
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = '-- No Currencies Available --';
      selectElement.appendChild(defaultOption);
      return;
    }

    currencies.forEach((currency) => {
      const option = document.createElement('option');
      option.value = currency.id; // Use currency ID as the value
      option.textContent = `${currency.code} (${currency.symbol})`; // Display code and symbol
      if (selectedCurrencyId && currency.id === selectedCurrencyId) {
        option.selected = true;
      }
      selectElement.appendChild(option);
    });
  }

  // --- CRUD Functions ---
  async function addCategory(categoryName, categoryIcon) {
    try {
      console.log(`Attempting to add category: ${categoryName}`);
      // Check if the category exists *for the current user*
      const { data: existing, error: fetchError } = await supabaseClient
        .from('categories')
        .select('name')
        .eq('name', categoryName)
        .eq('user_id', loggedInUserId) // Add this condition
        .maybeSingle();

      if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;
      if (existing) {
        showToast(`Category "${categoryName}" already exists.`);
        return false;
      }

      // Get the current number of categories to determine the new order_index
      const newOrderIndex = currentCategories.length;
      const newCategory = {
        name: categoryName,
        user_id: loggedInUserId,
        icon_class: categoryIcon,
        icon_enabled: !!categoryIcon,
      };
      if (isOrderIndexSupported) {
        newCategory.order_index = newOrderIndex;
      }

      const { data, error } = await supabaseClient
        .from('categories')
        .insert([newCategory]) // Add user_id
        .select();

      if (error) throw error;
      if (!data || data.length === 0)
        throw new Error('Insert failed, no data returned.');

      console.log('Category added successfully to DB:', data);
      currentCategories = await getCategories(); // Update the global variable
      console.log(
        'Updated currentCategories after adding new category:',
        currentCategories,
      ); // Debugging line
      const menuItems = await getMenuItems();
      const menuGrid = document.querySelector('.menu-grid');
      await addCategoriesToNav(currentCategories, menuItems, menuGrid); // Use the updated global variable
      populateCategoryDropdown(
        document.getElementById('category'),
        currentCategories,
      );
      populateCategoryDropdown(
        document.getElementById('edit-category'),
        currentCategories,
      );
      showToast('Category added successfully');
      return true;
    } catch (error) {
      if (
        error.code === '42501' ||
        error.message.includes('violates row-level security policy')
      ) {
        handleError(
          error,
          'Failed to add category: RLS policy prevents this. Check Supabase settings.',
        );
      } else {
        handleError(error, 'Failed to add category');
      }
      return false;
    }
  }

  async function addMenuItem(itemData, imageFile) {
    // Accept itemData and imageFile separately
    const loadingIndicator = document.getElementById('loading-indicator');
    loadingIndicator.classList.add('visible'); // Show loading indicator

    try {
      console.log('Attempting to add menu item:', itemData);
      itemData.price = parseFloat(itemData.price);
      if (isNaN(itemData.price))
        throw new Error('Price must be a valid number.');
      if (!itemData.currency_id) throw new Error('Currency must be selected.'); // Check for currency_id

      let imagePath = null;
      if (imageFile) {
        // --- Image Validation ---
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        const maxSize = 2 * 1024 * 1024; // 2 MB

        if (!allowedTypes.includes(imageFile.type)) {
          throw new Error(
            'Invalid image type. Only JPG, PNG, WEBP are allowed.',
          );
        }
        if (imageFile.size > maxSize) {
          throw new Error('Image file size exceeds 2MB limit.');
        }

        // Generate a unique file path (e.g., using timestamp and filename)
        const fileExt = imageFile.name.split('.').pop();
        const uniqueFileName = `${Date.now()}-${loggedInUserId}.${fileExt}`; // Ensure unique per user
        const filePath = `menu-items/${uniqueFileName}`; // Store in a 'menu-items' folder within the bucket

        console.log(`Uploading image to R2 path: ${filePath}`);

        const uploadParams = {
          Bucket: CLOUDFLARE_BUCKET_NAME_MENU,
          Key: filePath,
          Body: imageFile,
          ContentType: imageFile.type,
        };

        const uploadResult = await r2ClientMenu.upload(uploadParams).promise();

        if (!uploadResult || !uploadResult.Key) {
          throw new Error('Image upload to R2 failed: No key returned.');
        }
        imagePath = uploadResult.Key; // R2 returns the Key (filePath)
        console.log('Image uploaded successfully to R2, path:', imagePath);
      } else {
        console.log('No image file provided for upload.');
      }

      // Add the image path and currency_id to the item data before inserting
      const itemToInsert = {
        ...itemData,
        image: imagePath,
        user_id: loggedInUserId,
        currency_id: itemData.currency_id,
      };

      console.log('Inserting item data into DB:', itemToInsert);
      const { data, error } = await supabaseClient
        .from('menu_items')
        .insert([itemToInsert])
        .select();

      if (error) throw error;
      if (!data || data.length === 0)
        throw new Error('Insert failed, no data returned.');

      console.log('Menu item added successfully to DB:', data);
      const updatedItems = await getMenuItems();
      const menuGrid = document.querySelector('.menu-grid');
      const activeCategoryButton = document.querySelector(
        '.category-nav .category-scroll .category-btn.active',
      );
      const activeCategory = activeCategoryButton
        ? activeCategoryButton.textContent
        : 'All';
      filterMenuItems(
        activeCategory,
        updatedItems,
        menuGrid,
        isEditMode,
        currentCategories,
      ); // Pass edit mode state and categories
      showToast('Item added successfully');
      return true;
    } catch (error) {
      if (
        error.code === '42501' ||
        error.message.includes('violates row-level security policy')
      ) {
        handleError(
          error,
          'Failed to add item: RLS policy prevents this. Check Supabase settings.',
        );
      } else {
        handleError(error, 'Failed to add item');
      }
      return false;
    } finally {
      loadingIndicator.classList.remove('visible'); // Hide loading indicator
    }
  }

  async function editMenuItem(index, itemData, newImageFile, currentMenuItems) {
    // Accept newImageFile
    try {
      if (
        index < 0 ||
        index >= currentMenuItems.length ||
        !currentMenuItems[index]?.id
      ) {
        throw new Error('Invalid item data for editing');
      }
      const itemId = currentMenuItems[index].id;
      const originalItem = currentMenuItems[index]; // Keep track of the original item
      console.log(`Attempting to edit menu item ID: ${itemId}`, itemData);

      itemData.price = parseFloat(itemData.price);
      if (isNaN(itemData.price))
        throw new Error('Price must be a valid number.');

      let newImagePath = originalItem.image; // Default to original image path
      let oldImagePathToDelete = null;

      if (newImageFile) {
        // Upload new image
        const fileExt = newImageFile.name.split('.').pop();
        const uniqueFileName = `${Date.now()}.${fileExt}`;
        const filePath = `public/${uniqueFileName}`;

        console.log(`Uploading new image to path: ${filePath}`);
        const uploadParams = {
          Bucket: CLOUDFLARE_BUCKET_NAME_MENU,
          Key: filePath, // Use the generated file path as the key
          Body: newImageFile,
          ContentType: newImageFile.type,
        };
        await r2ClientMenu.putObject(uploadParams).promise(); // Use .promise() for async/await

        newImagePath = filePath; // Set the new path to the R2 key
        oldImagePathToDelete = originalItem.image; // Mark old image for deletion if it existed
        console.log('New image uploaded successfully, path:', newImagePath);
      } else {
        console.log('No new image file provided for edit.');
      }

      // Update item data with potentially new image path
      const itemToUpdate = { ...itemData, image: newImagePath };

      console.log('Updating item data in DB:', itemToUpdate);
      const { data, error } = await supabaseClient
        .from('menu_items')
        .update(itemToUpdate)
        .eq('id', itemId)
        .select();

      if (error) throw error;
      if (!data || data.length === 0)
        throw new Error('Update failed, no data returned.');

      console.log('Menu item edited successfully in DB:', data);

      // Delete old image from storage AFTER successful DB update
      if (oldImagePathToDelete) {
        console.log(`Attempting to delete old image: ${oldImagePathToDelete}`);
        const deleteParams = {
          Bucket: CLOUDFLARE_BUCKET_NAME_MENU,
          Key: oldImagePathToDelete.replace(
            `${CLOUDFLARE_PUBLIC_BASE_URL_MENU}/`,
            '',
          ), // Remove base URL if present
        };
        await r2ClientMenu.deleteObject(deleteParams).promise();
        console.log(`Successfully deleted old image: ${oldImagePathToDelete}`);
      }

      // --- Update the item in the global currentMenuItems array ---
      const itemInGlobalArray = currentMenuItems[index]; // Use the 'index' parameter passed to the function
      if (itemInGlobalArray) {
        // Merge the updated data (name, price, category, description) from the form
        // Note: 'updatedData' is the parameter name in handleSaveItem,
        // but inside editMenuItem, the equivalent data is 'itemData' (parameter 2)
        // We also need the potentially updated 'newImagePath'
        const dataToMerge = { ...itemData, image: newImagePath }; // Combine form data and new image path
        // Ensure currency_id is also updated in the local array
        itemInGlobalArray.currency_id = itemData.currency_id;
        Object.assign(itemInGlobalArray, dataToMerge);

        console.log(
          'Updated item directly in global currentMenuItems:',
          itemInGlobalArray,
        );
      } else {
        // This shouldn't happen if index was valid, but log if it does
        console.error(
          'Item index not found in currentMenuItems during update:',
          index,
        );
        // As a fallback, could fetch all items here: currentMenuItems = await getMenuItems();
      }
      // --- End item update ---

      const menuGrid = document.querySelector('.menu-grid');
      const activeCategoryButton = document.querySelector(
        '.category-nav .category-scroll .category-btn.active',
      );
      const activeCategory = activeCategoryButton
        ? activeCategoryButton.textContent
        : 'All';
      // Now filter using the mutated global currentMenuItems
      filterMenuItems(
        activeCategory,
        currentMenuItems,
        menuGrid,
        isEditMode,
        currentCategories,
      );
      showToast('Item edited successfully');
      return true;
    } catch (error) {
      if (
        error.code === '42501' ||
        error.message.includes('violates row-level security policy')
      ) {
        handleError(
          error,
          'Failed to edit item: RLS policy prevents this action.',
        );
      } else {
        handleError(error, 'Failed to edit item');
      }
      return false;
    }
  }

  // --- Inline Edit Handlers ---
  async function handleSaveItem(cardElement, itemId) {
    console.log(`Attempting to save item ID: ${itemId}`);
    const nameInput = cardElement.querySelector('.edit-name-input');
    const priceInput = cardElement.querySelector('.edit-price-input');
    const currencySelect = cardElement.querySelector('.edit-currency-select');
    const categorySelect = cardElement.querySelector('.edit-category-select');
    const descriptionTextarea = cardElement.querySelector(
      '.edit-description-textarea',
    );
    const imageInput = cardElement.querySelector('.edit-image-input');

    const newImageFile = imageInput.files[0]; // Get the new file, if any

    const updatedData = {
      name: nameInput.value.trim(),
      price: priceInput.value, // Validation happens in editMenuItem
      currency_id: currencySelect.value, // Changed to currency_id
      category: categorySelect.value,
      description: descriptionTextarea.value.trim(),
      // image path is handled by editMenuItem based on newImageFile
    };

    // Basic validation
    if (
      !updatedData.name ||
      !updatedData.price ||
      !updatedData.currency_id ||
      !updatedData.category
    ) {
      // Changed to currency_id
      showToast('Please fill in Name, Price, Currency, and Category.');
      return;
    }
    if (isNaN(parseFloat(updatedData.price))) {
      showToast('Price must be a valid number.');
      return;
    }

    // Find the index of the item being edited
    const itemIndex = currentMenuItems.findIndex((item) => item.id === itemId);
    if (itemIndex === -1) {
      handleError(
        new Error(`Item with ID ${itemId} not found in currentMenuItems`),
        'Save failed',
      );
      return;
    }

    // Disable save button during operation
    const saveButton = cardElement.querySelector('.save-item-btn');
    if (saveButton) saveButton.disabled = true;

    // Call the existing editMenuItem function
    const success = await editMenuItem(
      itemIndex,
      updatedData,
      newImageFile,
      currentMenuItems,
    );

    if (success) {
      // Refresh the data and re-render the grid (editMenuItem already does this)
      // Optionally, could just update the single card visually if editMenuItem returned the updated item
      showToast('Item saved successfully.');
      // Exit edit mode after saving one item? Or allow multiple saves?
      // For now, stay in edit mode. User clicks "Finish Editing" when done.
    } else {
      showToast('Failed to save item. Check console.');
      // Re-enable save button on failure
      if (saveButton) saveButton.disabled = false;
    }
  }

  function handleCancelEdit(cardElement, originalItemData) {
    console.log(`Cancelling edit for item ID: ${originalItemData.id}`);
    // Re-render the card in non-edit mode using the original data
    const newCard = createMenuItemCard(
      originalItemData,
      false,
      currentCategories,
    ); // Render in display mode
    cardElement.parentNode.replaceChild(newCard, cardElement); // Replace the old card with the new one
  }

  async function deleteMenuItem(index, currentMenuItems) {
    try {
      if (
        index < 0 ||
        index >= currentMenuItems.length ||
        !currentMenuItems[index]?.id
      ) {
        throw new Error('Invalid item data for deletion');
      }
      const itemId = currentMenuItems[index].id;
      console.log(`Attempting to delete menu item ID: ${itemId}`);

      // First, get the image path before deleting the item from the database
      const { data: itemToDelete, error: fetchError } = await supabaseClient
        .from('menu_items')
        .select('image')
        .eq('id', itemId)
        .single();

      if (fetchError) throw fetchError;

      const { error } = await supabaseClient
        .from('menu_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;

      console.log('Menu item deleted successfully from DB');

      // If an image path exists, delete the image from Cloudflare R2
      if (itemToDelete && itemToDelete.image) {
        console.log(
          `Attempting to delete image from R2: ${itemToDelete.image}`,
        );
        const deleteParams = {
          Bucket: CLOUDFLARE_BUCKET_NAME_MENU,
          Key: itemToDelete.image.replace(
            `${CLOUDFLARE_PUBLIC_BASE_URL_MENU}/`,
            '',
          ), // Remove base URL if present
        };
        await r2ClientMenu.deleteObject(deleteParams).promise();
        console.log(
          `Successfully deleted image from R2: ${itemToDelete.image}`,
        );
      }

      // Remove from currentMenuItems and refresh UI
      currentMenuItems.splice(index, 1);
      const menuGrid = document.querySelector('.menu-grid');
      const activeCategoryButton = document.querySelector(
        '.category-nav .category-scroll .category-btn.active',
      );
      const activeCategory = activeCategoryButton
        ? activeCategoryButton.textContent
        : 'All';
      filterMenuItems(
        activeCategory,
        currentMenuItems,
        menuGrid,
        isEditMode,
        currentCategories,
      );
      showToast('Item deleted successfully');
      return true; // Indicate DB deletion success
    } catch (error) {
      if (
        error.code === '42501' ||
        error.message.includes('violates row-level security policy')
      ) {
        handleError(
          error,
          'Failed to delete item: RLS policy prevents this action.',
        );
      } else {
        handleError(error, 'Failed to delete item');
      }
      return false; // Indicate DB deletion failure
    }
  }

  // --- Delete Category Function ---
  async function handleDeleteCategory(categoryId, categoryName) {
    console.log(
      `Attempting to delete category ID: ${categoryId}, Name: ${categoryName}`,
    );

    // Confirm with the user
    const confirmDelete = confirm(
      `Are you sure you want to delete the category "${categoryName}"? This will also delete all menu items within this category.`,
    );
    if (!confirmDelete) {
      showToast('Category deletion cancelled.');
      return;
    }

    try {
      // 1. Delete associated menu items first
      console.log(`Deleting menu items for category: ${categoryName}`);
      const { error: itemDeleteError } = await supabaseClient
        .from('menu_items')
        .delete()
        .eq('category', categoryName)
        .eq('user_id', loggedInUserId); // Ensure user ownership

      if (itemDeleteError)
        throw new Error(
          `Failed to delete associated menu items: ${itemDeleteError.message}`,
        );
      console.log(
        `Successfully deleted menu items for category: ${categoryName}`,
      );

      // 2. Delete the category itself
      console.log(`Deleting category: ${categoryName}`);
      const { error: categoryDeleteError } = await supabaseClient
        .from('categories')
        .delete()
        .eq('id', categoryId)
        .eq('user_id', loggedInUserId); // Ensure user ownership

      if (categoryDeleteError)
        throw new Error(
          `Failed to delete category: ${categoryDeleteError.message}`,
        );
      console.log(`Category "${categoryName}" deleted successfully.`);

      showToast(
        `Category "${categoryName}" and its items deleted successfully!`,
      );

      // Re-fetch and re-render everything
      // Refresh all data and UI
      currentCategories = await getCategories();
      currentMenuItems = await getMenuItems();
      addCategoriesToNav(
        currentCategories,
        currentMenuItems,
        document.querySelector('.menu-grid'),
      );
      filterMenuItems(
        'All',
        currentMenuItems,
        document.querySelector('.menu-grid'),
        isEditMode,
        currentCategories,
      );
    } catch (error) {
      handleError(error, `Failed to delete category "${categoryName}"`);
      showToast(`Error deleting category "${categoryName}".`);
    }
  }

  // --- Event Listener Setup ---
  document.addEventListener('DOMContentLoaded', async () => {
    // Make async for await getSession
    console.log('DOM fully loaded and parsed');

    // currentMenuItems and currentCategories are now declared globally
    // isEditMode is now declared globally

    const menuGrid = document.querySelector('.menu-grid');
    const addItemBtn = document.getElementById('add-item-btn');
    const editItemsBtn = document.getElementById('edit-items-btn');

    // Fetch currencies on load
    console.log('DEBUG: Fetching currencies in DOMContentLoaded...');
    currentCurrencies = await getCurrencies();
    console.log(
      'DEBUG: currentCurrencies after fetch (in DOMContentLoaded):',
      currentCurrencies,
    );
    const addCategoryBtn = document.getElementById('add-category-btn');
    const shareMenuBtn = document.getElementById('share-menu-btn'); // Get the new button
    const editCoverPhotoBtn = document.getElementById('edit-cover-photo-btn');

    const addItemContainer = document.getElementById('add-item-container');
    const editItemContainer = document.getElementById('edit-item-container');
    const addCategoryContainer = document.getElementById(
      'add-category-container',
    );
    const editItemsListContainer = document.getElementById(
      'edit-items-list-container',
    );
    const addItemModal = document.getElementById('add-item-modal'); // Get the add item modal overlay
    const addCategoryModal = document.getElementById('add-category-modal'); // Get the add category modal overlay
    const editInfoModal = document.getElementById('edit-info-modal'); // Get the edit info modal overlay
    const editCoverPhotoModal = document.getElementById('edit-cover-photo-modal');
    const shareMenuModal = document.getElementById('share-menu-modal'); // Get share menu modal
    const shareLinkMessage = document.getElementById('share-link-message'); // Get the share link message element
    const generateQrBtn = document.getElementById('generate-qr-btn'); // Get the generate QR button
    const qrcodeContainer = document.getElementById('qrcode-container'); // Get the QR code container
    const qrCodeModal = document.getElementById('qr-code-modal'); // New QR code modal
    const qrCodeDisplay = document.getElementById('qr-code-display'); // QR code display div
    const qrLoadingSpinner = document.getElementById('qr-loading-spinner'); // Loading spinner
    const closeButtons = document.querySelectorAll('.modal-content .close-btn'); // Declare closeButtons here
    const modalOverlays = document.querySelectorAll('.modal-overlay'); // Declare modalOverlays here

    // Log the elements to ensure they are correctly selected
    console.log('closeButtons NodeList:', closeButtons);
    console.log('modalOverlays NodeList:', modalOverlays);

    const addItemFormElement = document.getElementById('add-item-form');
    const editItemFormElement = document.getElementById('edit-item-form');
    const addCategoryFormElement = document.getElementById('add-category-form');
    const editInfoFormElement = document.getElementById('edit-info-form'); // Get the edit info form
    const editCoverPhotoFormElement = document.getElementById('edit-cover-photo-form');
    const editPhoneNumberInput = document.getElementById('edit-phone-number'); // Get the phone number input
    const editAreaInput = document.getElementById('edit-area'); // Get the area input
    const editInfoCancelBtn = document.getElementById('cancel-edit-info-btn'); // Get the cancel button
    const editCoverPhotoCancelBtn = document.getElementById('cancel-edit-cover-photo-btn');
    const editBackgroundInput = document.getElementById(
      'edit-background-color',
    ); // Get background color input
    const editItemColorInput = document.getElementById('edit-item-color'); // Get item color input
    const addItemCurrencySelect = document.getElementById('currency'); // Get the currency select for add item
    const editItemCurrencySelect = document.getElementById('edit-currency'); // Get the currency select for edit item

    const menuItemsListUl = document.getElementById('menu-items-list');

    // --- Modal Close Button Handlers ---
    const addItemCloseBtn = addItemModal
      ? addItemModal.querySelector('.close-btn')
      : null;
    if (addItemCloseBtn && addItemModal) {
      addItemCloseBtn.addEventListener('click', () => {
        addItemModal.classList.remove('visible'); // Hide the modal
      });
    } else {
      console.error('Add item modal close button or modal not found');
    }

    const addCategoryCloseBtn = addCategoryModal
      ? addCategoryModal.querySelector('.close-btn')
      : null;
    if (addCategoryCloseBtn && addCategoryModal) {
      addCategoryCloseBtn.addEventListener('click', () => {
        addCategoryModal.classList.remove('visible'); // Hide the modal
      });
    } else {
      console.error('Add category modal close button or modal not found');
    }

    const editInfoCloseBtn = editInfoModal
      ? editInfoModal.querySelector('.close-btn')
      : null;
    if (editInfoCloseBtn && editInfoModal) {
      editInfoCloseBtn.addEventListener('click', () => {
        editInfoModal.classList.remove('visible'); // Hide the modal
      });
    } else {
      console.error('Edit info modal close button or modal not found');
    }

    if (editCoverPhotoCancelBtn && editCoverPhotoModal) {
      editCoverPhotoCancelBtn.addEventListener('click', () => {
        editCoverPhotoModal.classList.remove('visible'); // Hide the modal
      });
    }

    function hideAllSections() {
      console.log('Hiding all sections');
      // Removed hiding addItemContainer as it's part of the modal
      if (editItemContainer) editItemContainer.style.display = 'none';
      // Removed hiding addCategoryContainer as it's part of the modal
      if (editItemsListContainer) editItemsListContainer.style.display = 'none';
    }

    // --- Authentication Check ---
    console.log('Checking user session...');
    const {
      data: { session },
      error: sessionError,
    } = await supabaseClient.auth.getSession();

    if (sessionError) {
      console.error('Error getting session:', sessionError);
      handleError(sessionError, 'Could not verify user session');
      console.log('Redirecting to auth.html due to session error.'); // Added log
      window.location.href = 'auth.html'; // Redirect if session check fails
      return;
    }

    if (!session || !session.user) {
      console.log('No active session found. Redirecting to login.');
      window.location.href = 'auth.html'; // Redirect if no session
      return;
    }

    loggedInUserId = session.user.id; // Store the validated user ID
    console.log('User session validated. User ID:', loggedInUserId);
    console.log('Session object:', session); // Added log for session object

    // --- Fetch and display restaurant profile ---
    const userProfile = await getUserProfile(loggedInUserId);
    if (userProfile) {
      const restaurantNameElement = document.querySelector('.restaurant-name');
      const logoElement = document.querySelector('.logo');
      const coverPhotoElement = document.getElementById('cover-photo');

      if (restaurantNameElement) {
        restaurantNameElement.textContent =
          userProfile.restaurant_name || 'Your Restaurant';
      }

      // Apply fetched background color on page load
      if (userProfile.background_color) {
        document.body.style.backgroundColor = userProfile.background_color;
      }

      if (userProfile.cover_photo_url) {
        coverPhotoElement.style.backgroundImage = `url('${getProfileLogoPublicUrl(
          userProfile.cover_photo_url,
        )}')`;
      }

      if (restaurantNameElement) {
        restaurantNameElement.textContent =
          userProfile.restaurant_name || 'Your Restaurant';
        console.log(
          'Updated restaurant name to:',
          restaurantNameElement.textContent,
        );
      } else {
        console.error('Restaurant name element not found.');
      }

      if (logoElement) {
        const logoUrl = getProfileLogoPublicUrl(userProfile.logo_url);
      }

      // Apply item color after menu items are rendered during initial load
      // This needs to be done after filterMenuItems is called
      // The filterMenuItems function is called within the Promise.all block below
      // So, we will add the item color application there.

      if (logoElement) {
        const logoUrl = getProfileLogoPublicUrl(userProfile.logo_url);
        logoElement.src = logoUrl;
        logoElement.alt = `${userProfile.restaurant_name || 'Restaurant'} Logo`;
        console.log('Updated logo src to:', logoElement.src);
      } else {
        console.error('Logo element not found.');
      }
      const phoneNumberElement = document.getElementById(
        'restaurant-phone-number',
      );
      const areaElement = document.getElementById('restaurant-area');

      if (phoneNumberElement) {
        phoneNumberElement.textContent = userProfile.phone_number || '';
        console.log('Updated phone number to:', phoneNumberElement.textContent);
      } else {
        console.error('Phone number element not found.');
      }

      if (areaElement) {
        areaElement.textContent = userProfile.area || '';
        console.log('Updated area to:', areaElement.textContent);
      } else {
        console.error('Area element not found.');
      }
    } else {
      console.warn(
        'Could not fetch user profile. Using default name and logo.',
      );
      // Optionally set default name/logo here if profile fetch fails
    }

    // --- Initial Data Load (only if authenticated) ---
    if (loggedInUserId) {
      console.log(
        'Proceeding with initial data load for user:',
        loggedInUserId,
      );
      console.log('Calling getMenuItems and getCategories...'); // Added log
      Promise.all([getMenuItems(), getCategories()])
        .then(([menuData, categoryData]) => {
          console.log('Initial data fetch promise resolved.'); // Added log
          console.log('Initial data fetched for user', {
            menuData,
            categoryData,
          });
          currentMenuItems = menuData;
          currentCategories = categoryData;
          if (menuGrid) {
            console.log('Filtering menu items after initial load.'); // Added log
            filterMenuItems(
              'All',
              currentMenuItems,
              menuGrid,
              isEditMode,
              currentCategories,
            );

            // Apply item color after filtering and rendering
            // Re-fetch profile to get colors, as userProfile might be from an earlier scope
            getUserProfile(loggedInUserId)
              .then((profile) => {
                if (profile) {
                  if (profile.item_color) {
                    document.querySelectorAll('.menu-item').forEach((item) => {
                      item.style.backgroundColor = profile.item_color;
                    });
                  }
                  if (profile.item_name_color) {
                    document
                      .querySelectorAll('.item-name')
                      .forEach((nameElement) => {
                        nameElement.style.color = profile.item_name_color;
                      });
                  }
                  if (profile.item_price_color) {
                    document
                      .querySelectorAll('.item-price')
                      .forEach((priceElement) => {
                        priceElement.style.color = profile.item_price_color;
                      });
                  }
                }
              })
              .catch((error) => {
                console.error(
                  'Error applying item colors on initial load:',
                  error,
                );
              });
          } else {
            // Closing brace for the if (menuGrid) block was missing
            console.error('menuGrid not found on initial load');
          } // Closing brace for the else block
          addCategoriesToNav(currentCategories, currentMenuItems, menuGrid);
          populateCategoryDropdown(
            document.getElementById('category'),
            currentCategories,
          );
          populateCategoryDropdown(
            document.getElementById('edit-category'),
            currentCategories,
          );
          console.log(
            'Restaurant name element:',
            document.querySelector('.restaurant-name'),
          );
          console.log(
            'Restaurant name textContent:',
            document.querySelector('.restaurant-name')?.textContent,
          );
        })
        .catch((error) => {
          console.error('Error during initial data load promise:', error);
          handleError(error, 'Failed to load initial menu or category data');
        });
    } else {
      console.error(
        'Authentication check passed but loggedInUserId is not set. This should not happen.',
      );
      window.location.href = 'auth.html';
    }

    // --- Button Click Handlers ---
    if (addItemBtn && addItemContainer) {
      addItemBtn.addEventListener('click', () => {
        console.log('Add item button clicked');
        hideAllSections();
        addItemModal.style.display = 'flex';
        setTimeout(() => {
          addItemModal.classList.add('visible');
        }, 10);
        populateCategoryDropdown(
          document.getElementById('category'),
          currentCategories,
        );
        populateCurrencyDropdown(
          document.getElementById('currency'),
          currentCurrencies,
        ); // Add this line
        // Reset the form in case it was previously used
        if (addItemFormElement) addItemFormElement.reset();
      });
    } else {
      console.error('Add item button or container not found');
    }

    if (addCategoryBtn && addCategoryContainer) {
      addCategoryBtn.addEventListener('click', () => {
        console.log('Add category button clicked');
        console.log('Showing add category modal'); // Added log
        hideAllSections();
        if (addCategoryModal) {
          addCategoryModal.style.display = 'flex';
          setTimeout(() => {
            addCategoryModal.classList.add('visible');
          }, 10);
        }
        // Reset the form in case it was previously used
        if (addCategoryFormElement) addCategoryFormElement.reset();
      });
    } else {
      console.error('Add category button or container not found');
    }

    if (editCoverPhotoBtn && editCoverPhotoModal) {
      editCoverPhotoBtn.addEventListener('click', () => {
        console.log('Edit Cover Photo button clicked');
        hideAllSections();
        editCoverPhotoModal.style.display = 'flex';
        setTimeout(() => {
          editCoverPhotoModal.classList.add('visible');
        }, 10);
      });
    }

    if (editItemsBtn && menuGrid) {
      // Check for menuGrid instead of list container/ul
      editItemsBtn.addEventListener('click', () => {
        isEditMode = !isEditMode; // Toggle edit mode state
        console.log(`Edit mode toggled: ${isEditMode}`);
        editItemsBtn.textContent = isEditMode ? 'Finish Editing' : 'Edit Items';
        editItemsBtn.classList.toggle('active', isEditMode); // Optional: style the button when active

        // Hide other forms if entering edit mode
        if (isEditMode) {
          hideAllSections();
          if (isMenuItemOrderIndexSupported) {
            menuItemsSortable = new Sortable(menuGrid, {
              animation: 300,
              delay: 200,
              touchStartThreshold: 5,
              onEnd: updateMenuItemOrder,
            });
          }
        } else {
          if (menuItemsSortable) {
            menuItemsSortable.destroy();
            menuItemsSortable = null;
          }
        }

        // Re-render the category navigation to show/hide delete icons
        addCategoriesToNav(currentCategories, currentMenuItems, menuGrid);

        // Re-render the grid with the current filter and edit state
        const activeCategoryButton = document.querySelector(
          '.category-nav .category-scroll .category-btn.active',
        );
        const activeCategory = activeCategoryButton
          ? activeCategoryButton.textContent
          : 'All';
        // Pass the isEditMode state and categories to filterMenuItems
        filterMenuItems(
          activeCategory,
          currentMenuItems,
          menuGrid,
          isEditMode,
          currentCategories,
        );
      });
    } else {
      console.error('Edit items button or menu grid not found');
    }

    // --- Form Submit Handlers ---
    if (addItemBtn) {
      addItemBtn.addEventListener('click', () => {
        console.log('DEBUG: Add Item button clicked.');
      });
    }

    if (addCategoryFormElement) {
      const addCategorySubmitBtn = addCategoryFormElement.querySelector(
        'button[type="submit"]',
      );
      if (addCategorySubmitBtn) {
        addCategorySubmitBtn.addEventListener('touchend', async (event) => {
          event.preventDefault();
          event.stopPropagation();
          console.log('Add category submit button touchend event triggered.');
          // Delay to ensure click event doesn't also fire, or to allow iOS to process
          setTimeout(() => {
            addCategoryFormElement.dispatchEvent(
              new Event('submit', { cancelable: true }),
            );
          }, 100);
        });
      }

      const iconPicker = document.getElementById('icon-picker-container');
      const categoryIconInput = document.getElementById('category-icon');

      iconPicker.addEventListener('click', (event) => {
        if (event.target.classList.contains('icon-picker-icon')) {
          // Remove selected class from all icons
          iconPicker.querySelectorAll('.icon-picker-icon').forEach((icon) => {
            icon.classList.remove('selected');
          });
          // Add selected class to the clicked icon
          event.target.classList.add('selected');
          // Set the value of the hidden input
          categoryIconInput.value = event.target.dataset.icon;
        }
      });

      addCategoryFormElement.addEventListener('submit', async (event) => {
        event.preventDefault();
        console.log('Add category form submitted (via click or touchend)');
        const categoryNameInput = document.getElementById('category-name');
        const categoryName = categoryNameInput.value.trim();
        const categoryIcon = categoryIconInput.value;
        console.log('Attempting to add category:', categoryName);

        if (categoryName) {
          const loadingIndicator = document.getElementById(
            'add-category-loading-indicator',
          );
          if (loadingIndicator) loadingIndicator.classList.add('visible');

          const success = await addCategory(categoryName, categoryIcon);

          if (loadingIndicator) loadingIndicator.classList.remove('visible');

          if (success) {
            addCategoryFormElement.reset();
            if (addCategoryModal) addCategoryModal.classList.remove('visible');
            console.log('Add category modal hidden on success');
            currentCategories = await getCategories();
          } else {
            if (addCategoryModal) addCategoryModal.classList.remove('visible');
            console.log('Add category modal hidden on failure');
          }
        } else {
          showToast('Please enter a category name.');
          console.log('Category name is empty.');
        }
      });
    } else {
      console.error('Add category form not found');
    }

    if (addItemFormElement) {
      const addItemSubmitBtn = addItemFormElement.querySelector(
        'button[type="submit"]',
      );
      if (addItemSubmitBtn) {
        addItemSubmitBtn.addEventListener('touchend', async (event) => {
          event.preventDefault();
          event.stopPropagation();
          console.log(
            'DEBUG: Add item submit button touchend event triggered.',
          );
          setTimeout(() => {
            console.log('DEBUG: Dispatching submit event for add item form.');
            addItemFormElement.dispatchEvent(
              new Event('submit', { cancelable: true }),
            );
          }, 100);
        });
      }

      addItemFormElement.addEventListener('submit', async (event) => {
        event.preventDefault();
        console.log('DEBUG: Add item form submitted (via click or touchend)');
        const imageInput = document.getElementById('image');
        const imageFile = imageInput.files[0];
        console.log(
          'DEBUG: Image file selected:',
          imageFile ? imageFile.name : 'No file',
        );

        const newItemData = {
          name: document.getElementById('name').value.trim(),
          price: document.getElementById('price').value,
          category: document.getElementById('category').value,
          currency_id: document.getElementById('currency').value, // Get selected currency ID
          description: document.getElementById('description').value.trim(),
        };
        console.log('DEBUG: New item data collected:', newItemData);

        if (
          !newItemData.name ||
          !newItemData.price ||
          !newItemData.category ||
          !newItemData.currency_id
        ) {
          showToast('Please fill in Name, Price, Category, and Currency.');
          console.log(
            'DEBUG: Add item form validation failed: missing fields.',
          );
          return;
        }
        if (isNaN(parseFloat(newItemData.price))) {
          showToast('Price must be a valid number.');
          console.log('DEBUG: Add item form validation failed: invalid price.');
          return;
        }

        console.log(
          'DEBUG: Calling addMenuItem function with data and image...',
        );
        const success = await addMenuItem(newItemData, imageFile);
        console.log('DEBUG: addMenuItem function returned, success:', success);

        if (success) {
          addItemFormElement.reset();
          addItemModal.classList.remove('visible');
          console.log('DEBUG: Add item modal hidden on success');
        } else {
          console.log('DEBUG: Add item operation failed.');
        }
      });
    } else {
      console.error('DEBUG: Add item form not found');
    }

    if (editCoverPhotoFormElement) {
      editCoverPhotoFormElement.addEventListener('submit', async (event) => {
        event.preventDefault();
        console.log('Edit cover photo form submitted');

        const newCoverPhotoFile = document.getElementById('edit-cover-photo').files[0];
        let newCoverPhotoPath = null;

        if (newCoverPhotoFile) {
          const fileExt = newCoverPhotoFile.name.split('.').pop();
          const uniqueFileName = `cover-photos/${loggedInUserId}-${Date.now()}.${fileExt}`;

          const uploadParams = {
            Bucket: CLOUDFLARE_BUCKET_NAME_MENU,
            Key: uniqueFileName,
            Body: newCoverPhotoFile,
            ContentType: newCoverPhotoFile.type,
          };

          try {
            const uploadResult = await r2ClientMenu
              .upload(uploadParams)
              .promise();
            newCoverPhotoPath = uploadResult.Key;
          } catch (error) {
            handleError(error, 'Failed to upload new cover photo');
            return;
          }
        }

        const updates = {};

        if (newCoverPhotoPath) {
          updates.cover_photo_url = newCoverPhotoPath;
        }

        const success = await updateUserProfile(updates);

        if (success) {
          showToast('Cover photo updated successfully!');
          editCoverPhotoFormElement.reset();
          if (editCoverPhotoModal) editCoverPhotoModal.classList.remove('visible');

          // Update the UI
          const userProfile = await getUserProfile(loggedInUserId);
          if (userProfile) {
            const coverPhotoElement = document.getElementById('cover-photo');
            if (coverPhotoElement && userProfile.cover_photo_url) {
              coverPhotoElement.style.backgroundImage = `url('${getProfileLogoPublicUrl(
                userProfile.cover_photo_url,
              )}')`;
            }
          }
        } else {
          showToast('Failed to update cover photo.');
        }
      });
    }

    // --- Share Menu Button Listener ---
    if (shareMenuBtn) {
      shareMenuBtn.addEventListener('click', async () => {
        if (!loggedInUserId) {
          showToast('Error: User not identified. Cannot create share link.');
          console.error('Share button clicked but loggedInUserId is null.');
          return;
        }

        // Construct the full URL dynamically
        // Assumes dashboard.html and menusharepage.html are in the same directory
        const shareLink = `${window.location.origin}/menusharepage.html?user=${loggedInUserId}`;
        console.log(
          'Share menu button clicked. Attempting to copy link and show modal.',
        );
        // Ensure the modal is displayed before adding the 'visible' class for transition
        shareMenuModal.style.display = 'flex';
        try {
          await navigator.clipboard.writeText(shareLink);
          shareLinkMessage.textContent = 'Link copied to clipboard!'; // Update message in modal
          shareLinkMessage.style.display = 'block'; // Ensure message is visible
          qrcodeContainer.innerHTML = ''; // Clear any previous QR code
          shareMenuModal.classList.add('visible'); // Show the modal by adding 'visible' class
        } catch (err) {
          console.error('Failed to copy link: ', err);
          shareLinkMessage.textContent =
            'Failed to copy link. Please copy manually.';
          shareLinkMessage.style.display = 'block';
          shareMenuModal.classList.add('visible'); // Show the modal even if copy fails
        }
      });
    } else {
      console.error('Share menu button not found');
    }
    // Generate QR Code Button
    if (generateQrBtn) {
      console.log('Generate QR button found. Attaching event listener.');
      generateQrBtn.addEventListener('click', async () => {
        // Made async to use await for spinner
        console.log('Generate QR button clicked.');
        if (!loggedInUserId) {
          showToast('Cannot generate QR code: User not logged in.');
          return;
        }
        const shareLink = `${window.location.origin}/menusharepage.html?user=${loggedInUserId}`;

        // Show loading spinner and hide previous QR code
        qrCodeDisplay.innerHTML = ''; // Clear previous QR code
        qrLoadingSpinner.style.display = 'block'; // Show spinner
        qrCodeModal.style.display = 'flex'; // Show QR code modal
        qrCodeModal.classList.add('visible'); // Add visible class for transition

        // Simulate loading time (optional, for demonstration)
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Generate QR code
        if (typeof QRCode === 'undefined') {
          console.error('QRCode library not loaded. Cannot generate QR code.');
          showToast('Error: QR code library not loaded.');
          qrLoadingSpinner.style.display = 'none';
          return;
        }
        new QRCode(qrCodeDisplay, {
          // Generate in the new qrCodeDisplay container
          text: shareLink,
          width: 200, // Increased size for better scanning
          height: 200,
          colorDark: '#000000',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.H,
        });

        // Get the canvas element generated by QRCode.js
        const qrCodeCanvas = qrCodeDisplay.querySelector('canvas');
        const downloadQrBtn = document.getElementById('download-qr-btn');

        if (qrCodeCanvas && downloadQrBtn) {
          downloadQrBtn.style.display = 'block'; // Show the download button
          downloadQrBtn.onclick = () => {
            // Create a temporary link element
            const link = document.createElement('a');
            link.download = 'qrcode-menu.png'; // Set the download filename
            link.href = qrCodeCanvas.toDataURL('image/png'); // Get data URL of the canvas
            document.body.appendChild(link); // Append to body
            link.click(); // Programmatically click the link to trigger download
            document.body.removeChild(link); // Remove the link
            showToast('QR Code downloaded!');
          };
        } else {
          console.error('QR Code canvas or download button not found.');
        }

        qrLoadingSpinner.style.display = 'none'; // Hide spinner
        shareMenuModal.classList.remove('visible'); // Hide the share menu modal
        setTimeout(() => {
          shareMenuModal.style.display = 'none';
        }, 300); // Match CSS transition duration
      });
    } else {
      console.error('Generate QR button not found.');
    }

    // --- Edit Info Button Listener ---
    const editInfoBtn = document.getElementById('edit-info-btn');
    if (editInfoBtn && editInfoModal) {
      editInfoBtn.addEventListener('click', async () => {
        console.log('Edit Info button clicked');
        hideAllSections(); // Hide other sections/modals

        // Populate the modal inputs with current profile data
        // Assuming userProfile is available from the initial fetch
        if (loggedInUserId) {
          const userProfile = await getUserProfile(loggedInUserId); // Re-fetch or use cached
          if (userProfile) {
            const logoPreview = document.getElementById('edit-logo-preview');
            if (logoPreview) {
              logoPreview.src = getProfileLogoPublicUrl(userProfile.logo_url);
            }
            if (editPhoneNumberInput)
              editPhoneNumberInput.value = userProfile.phone_number || '';
            if (editAreaInput) editAreaInput.value = userProfile.area || '';
            // Populate new color inputs
            // Declarations moved to the top of DOMContentLoaded
            if (editBackgroundInput)
              editBackgroundInput.value =
                userProfile.background_color || '#808080'; // Default grey
            if (editItemColorInput)
              editItemColorInput.value = userProfile.item_color || '#666666'; // Default grey
            if (document.getElementById('edit-item-name-color'))
              document.getElementById('edit-item-name-color').value =
                userProfile.item_name_color || '#ffffff';
            if (document.getElementById('edit-item-price-color'))
              document.getElementById('edit-item-price-color').value =
                userProfile.item_price_color || '#ffffff';
            if (document.getElementById('edit-item-description-color'))
              document.getElementById('edit-item-description-color').value =
                userProfile.item_description_color || '#ffffff';
          } else {
            console.warn(
              'Could not fetch user profile to populate edit info modal.',
            );
            // Optionally clear inputs or show a message
            if (editPhoneNumberInput) editPhoneNumberInput.value = '';
            if (editAreaInput) editAreaInput.value = '';
          }
        } else {
          console.error('User not logged in, cannot populate edit info modal.');
          // Optionally redirect to login or show error
        }

        console.log('Attempting to show edit info modal:', editInfoModal); // Added log
        editInfoModal.style.display = 'flex';
        setTimeout(() => {
          editInfoModal.classList.add('visible');
        }, 10); // Small timeout to allow display change before transition
      });
    } else {
      console.error('Edit Info button or modal not found');
    }

    // --- Edit Info Cancel Button Listener ---
    if (editInfoCancelBtn && editInfoModal) {
      editInfoCancelBtn.addEventListener('click', () => {
        console.log('Edit Info Cancel button clicked');
        editInfoModal.classList.remove('visible'); // Hide the modal
      });
    } else {
      console.error('Edit Info Cancel button or modal not found');
    }

    // --- Edit Info Form Submit Handler ---
    if (editInfoFormElement) {
      editInfoFormElement.addEventListener('submit', async (event) => {
        event.preventDefault();
        console.log('Edit info form submitted');

        const newLogoFile = document.getElementById('edit-logo').files[0];
        let newLogoPath = null;

        if (newLogoFile) {
          const fileExt = newLogoFile.name.split('.').pop();
          const uniqueFileName = `profile-logos/${loggedInUserId}-${Date.now()}.${fileExt}`;

          const uploadParams = {
            Bucket: CLOUDFLARE_BUCKET_NAME_MENU,
            Key: uniqueFileName,
            Body: newLogoFile,
            ContentType: newLogoFile.type,
          };

          try {
            const uploadResult = await r2ClientMenu
              .upload(uploadParams)
              .promise();
            newLogoPath = uploadResult.Key;
          } catch (error) {
            handleError(error, 'Failed to upload new logo');
            return;
          }
        }

        const updates = {
          phone_number: document
            .getElementById('edit-phone-number')
            .value.trim(),
          area: document.getElementById('edit-area').value.trim(),
          background_color: document.getElementById('edit-background-color')
            .value,
          item_color: document.getElementById('edit-item-color').value,
          item_name_color: document.getElementById('edit-item-name-color')
            .value,
          item_price_color: document.getElementById('edit-item-price-color')
            .value,
          item_description_color: document.getElementById(
            'edit-item-description-color',
          ).value,
        };

        if (newLogoPath) {
          updates.logo_url = newLogoPath;
        }

        const success = await updateUserProfile(updates);

        if (success) {
          showToast('Restaurant info updated successfully!');
          editInfoFormElement.reset();
          if (editInfoModal) editInfoModal.classList.remove('visible');

          // Update the UI
          const userProfile = await getUserProfile(loggedInUserId);
          if (userProfile) {
            const restaurantNameElement =
              document.querySelector('.restaurant-name');
            const logoElement = document.querySelector('.logo');
            if (restaurantNameElement) {
              restaurantNameElement.textContent =
                userProfile.restaurant_name || 'Your Restaurant';
            }
            if (logoElement) {
              logoElement.src = getProfileLogoPublicUrl(userProfile.logo_url);
            }
            document.body.style.backgroundColor = userProfile.background_color;
            document.querySelectorAll('.menu-item').forEach((item) => {
              item.style.backgroundColor = userProfile.item_color;
            });
            document.querySelectorAll('.item-name').forEach((nameElement) => {
              nameElement.style.color = userProfile.item_name_color;
            });
            document.querySelectorAll('.item-price').forEach((priceElement) => {
              priceElement.style.color = userProfile.item_price_color;
            });
            document
              .querySelectorAll('.item-description')
              .forEach((descriptionElement) => {
                descriptionElement.style.color =
                  userProfile.item_description_color;
              });
            document.getElementById('restaurant-phone-number').textContent =
              userProfile.phone_number || '';
            document.getElementById('restaurant-area').textContent =
              userProfile.area || '';
          }
        } else {
          showToast('Failed to update restaurant info.');
        }
      });
    } else {
      console.error('Edit info form not found');
    }

    // --- Edit/Delete Button Listeners within Edit List ---
    if (menuItemsListUl) {
      menuItemsListUl.addEventListener('click', async (event) => {
        const target = event.target;
        const index = parseInt(target.dataset.index, 10);

        if (target.classList.contains('edit-btn')) {
          console.log(`Edit button clicked for index: ${index}`);
          if (isNaN(index) || index < 0 || index >= currentMenuItems.length) {
            console.error('Invalid index for edit');
            return;
          }
          const itemToEdit = currentMenuItems[index];
          hideAllSections();

          // Populate edit form
          document.getElementById('edit-index').value = index;
          document.getElementById('edit-name').value = itemToEdit.name || '';
          document.getElementById('edit-price').value = itemToEdit.price || '';
          populateCategoryDropdown(
            document.getElementById('edit-category'),
            currentCategories,
            itemToEdit.category,
          );
          document.getElementById('edit-description').value =
            itemToEdit.description || '';
          // Clear the file input - user must select a new file if they want to change it
          document.getElementById('edit-image').value = null;
          // Optionally display current image:
          // const currentImageUrl = getImagePublicUrl(itemToEdit.image);
          // You could add an <img> tag near the file input to show this currentImageUrl

          editItemContainer.style.display = 'block';
        } else if (target.classList.contains('delete-btn')) {
          console.log(`Delete button clicked for index: ${index}`);
          if (isNaN(index) || index < 0 || index >= currentMenuItems.length) {
            console.error('Invalid index for delete');
            return;
          }
          const itemToDelete = currentMenuItems[index];
          if (
            confirm(`Are you sure you want to delete "${itemToDelete.name}"?`)
          ) {
            // Store the image path BEFORE deleting the item from the DB
            const imagePathToDelete = itemToDelete.image;

            const success = await deleteMenuItem(index, currentMenuItems); // Attempt DB deletion
            if (success) {
              // Only proceed if DB deletion was successful
              // If DB deletion was successful, delete the image from storage
              if (imagePathToDelete) {
                console.log(
                  `Attempting to delete image for deleted item: ${imagePathToDelete}`,
                );
                const { error: deleteError } = await supabaseClient.storage
                  .from('menu-item-images')
                  .remove([imagePathToDelete]);
                if (deleteError) {
                  console.error(
                    `Failed to delete image ${imagePathToDelete} for deleted item:`,
                    deleteError,
                  );
                } else {
                  console.log(
                    `Successfully deleted image ${imagePathToDelete} for deleted item.`,
                  );
                }
              }
              // Refresh the list view and local state *after* successful deletion and image removal attempt
              editItemsBtn.click();
              currentMenuItems = await getMenuItems(); // Update local state
            }
          }
        }
      });
    } else {
      console.error('Menu items list UL not found for event delegation');
    }

    // Close modals when clicking on the close button or overlay
    // Close modals when clicking on the close button or overlay
    closeButtons.forEach((button) => {
      button.addEventListener('click', (event) => {
        console.log(
          'Close button clicked for modal:',
          event.target.closest('.modal-overlay')?.id,
        );
        const modal = event.target.closest('.modal-overlay');
        if (modal) {
          modal.classList.remove('visible');
          // Use a timeout to allow the fade-out transition to complete before setting display to 'none'
          setTimeout(() => {
            modal.style.display = 'none';
          }, 300); // Match the transition duration in CSS (0.3s)

          // If it's the share menu modal, also clear the QR code and message
          if (modal.id === 'share-menu-modal') {
            shareLinkMessage.style.display = 'none';
            qrcodeContainer.innerHTML = '';
          } else if (modal.id === 'qr-code-modal') {
            // Handle QR code modal close
            qrCodeDisplay.innerHTML = '';
            qrLoadingSpinner.style.display = 'none';
          }
        }
      });
    });

    modalOverlays.forEach((overlay) => {
      overlay.addEventListener('click', (event) => {
        console.log(
          'Overlay clicked for modal:',
          overlay.id,
          'Target:',
          event.target,
        );
        // Only close if clicking directly on the overlay, not on the modal-content
        if (event.target === overlay) {
          overlay.classList.remove('visible');
          // Use a timeout to allow the fade-out transition to complete before setting display to 'none'
          setTimeout(() => {
            overlay.style.display = 'none';
          }, 300); // Match the transition duration in CSS (0.3s)

          // If it's the share menu modal, also clear the QR code and message
          if (overlay.id === 'share-menu-modal') {
            shareLinkMessage.style.display = 'none';
            qrcodeContainer.innerHTML = '';
          } else if (overlay.id === 'qr-code-modal') {
            // Handle QR code modal close
            qrCodeDisplay.innerHTML = '';
            qrLoadingSpinner.style.display = 'none';
          }
        }
      });
    });
  }); // End DOMContentLoaded
} // End Supabase check else block
