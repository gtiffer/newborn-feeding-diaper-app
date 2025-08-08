// Supabase Configuration
const SUPABASE_URL = 'https://dhmiqezlsxomspajniic.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRobWlxZXpsc3hvbXNwYWpuaWljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQzNDE1NzUsImV4cCI6MjA2OTkxNzU3NX0.SzwVn7UNbchVBWYp4Gvei6Gb820IpXmqICgmXtiYgec'
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Authentication Manager
class AuthManager {
    constructor() {
        this.user = null;
        this.init();
    }

    async init() {
        // Check if user is already logged in
        const { data: { user } } = await supabaseClient.auth.getUser();
        
        if (user) {
            this.user = user;
            this.showApp();
        } else {
            this.showAuth();
        }

        // Set up auth event listeners
        this.setupAuthListeners();
    }

    setupAuthListeners() {
        // Toggle between sign in and sign up
        document.getElementById('toggleAuthMode').addEventListener('click', () => {
            this.toggleAuthMode();
        });

        // Handle form submission
        document.getElementById('authForm').addEventListener('submit', (e) => {
            this.handleAuth(e);
        });
    }

    toggleAuthMode() {
        const btn = document.getElementById('authSubmitBtn');
        const toggle = document.getElementById('toggleAuthMode');
        const container = document.querySelector('.auth-container');
        const heading = container.querySelector('h2');
        const description = container.querySelector('p');
        
        if (btn.textContent === 'Sign In') {
            // Switch to Sign Up mode
            btn.textContent = 'Create Account';
            btn.classList.add('signup-mode');
            toggle.textContent = 'Sign In';
            heading.textContent = 'Create Your Account';
            description.textContent = 'Join Little Logger to start tracking your baby\'s progress';
            container.classList.add('signup-mode');
        } else {
            // Switch to Sign In mode
            btn.textContent = 'Sign In';
            btn.classList.remove('signup-mode');
            toggle.textContent = 'Sign Up';
            heading.textContent = 'Welcome to Little Logger';
            description.textContent = 'Sign in to track your baby\'s feeding and diaper changes';
            container.classList.remove('signup-mode');
        }
    }

    async handleAuth(e) {
        e.preventDefault();
        
        const email = document.getElementById('authEmail').value;
        const password = document.getElementById('authPassword').value;
        const isSignUp = document.getElementById('authSubmitBtn').textContent === 'Create Account';
        const submitBtn = document.getElementById('authSubmitBtn');

        // Show loading state
        submitBtn.textContent = 'Loading...';
        submitBtn.disabled = true;

        try {
            let result;
            
            if (isSignUp) {
                result = await supabaseClient.auth.signUp({
                    email: email,
                    password: password,
                });
                
                if (result.error) throw result.error;
                
                alert('Check your email for the confirmation link!');
                submitBtn.textContent = 'Create Account';
                submitBtn.disabled = false;
            } else {
                result = await supabaseClient.auth.signInWithPassword({
                    email: email,
                    password: password,
                });
                
                if (result.error) throw result.error;
                
                this.user = result.data.user;
                console.log('Sign in successful, user:', this.user);
                alert('Sign in successful! Loading app...');
                this.showApp();
            }
        } catch (error) {
            console.error('Auth error:', error);
            alert('Error: ' + error.message);
            submitBtn.textContent = isSignUp ? 'Create Account' : 'Sign In';
            submitBtn.disabled = false;
        }
    }

    showAuth() {
        document.getElementById('authScreen').classList.remove('hidden');
        document.getElementById('appMain').classList.add('hidden');
    }

    showApp() {
        document.getElementById('authScreen').classList.add('hidden');
        document.getElementById('appMain').classList.remove('hidden');
        
        // Initialize the baby tracker
        if (!window.tracker) {
            window.tracker = new BabyTracker();
        }
    }

    async signOut() {
        await supabaseClient.auth.signOut();
        this.user = null;
        this.showAuth();
    }
}

// Data Management
class BabyTracker {
    constructor() {
        this.entries = [];
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.setDefaultDateTime();
        this.loadTheme();
        
        // Load entries from database
        this.entries = await this.loadEntries();
        this.updateQuickStats();
        this.updateBreastStats();
        this.displayRecentEntries();
    }

    async loadEntries() {
        try {
            // First check if user is authenticated
            const { data: { user } } = await supabaseClient.auth.getUser();
            if (!user) return [];

            const { data, error } = await supabaseClient
                .from('entries')
                .select('*')
                .eq('user_id', user.id)
                .order('datetime', { ascending: false });

            if (error) throw error;

            // Transform data from Supabase format to app format
            return data.map(entry => {
                // Normalize: entries.datetime may be ISO (UTC) or local string
                const datetime = entry.datetime;
                const timestamp = new Date(datetime).getTime();
                return {
                    id: entry.id,
                    type: entry.type,
                    datetime: datetime,
                    timestamp: timestamp,
                    ...entry.data
                };
            });
        } catch (error) {
            console.error('Error loading entries:', error);
            return [];
        }
    }

    async saveEntry(entry) {
        try {
            const { data: { user } } = await supabaseClient.auth.getUser();
            if (!user) throw new Error('User not authenticated');

            // Extract the entry data (everything except id, type, datetime, timestamp)
            const { id, type, datetime, timestamp, ...entryData } = entry;

            // Store as UTC ISO to avoid timezone ambiguity in DB
            const storedDatetime = this.toUTCISOStringFromLocal(datetime);
            
            const { data, error } = await supabaseClient
                .from('entries')
                .insert({
                    user_id: user.id,
                    type: type,
                    datetime: storedDatetime,
                    data: entryData
                })
                .select()
                .single();

            if (error) throw error;
            
            return data;
        } catch (error) {
            console.error('Error saving entry:', error);
            alert('Unable to save entry: ' + error.message);
        }
    }

    async updateEntry(entry) {
        try {
            const { data: { user } } = await supabaseClient.auth.getUser();
            if (!user) throw new Error('User not authenticated');

            const { id, type, datetime, timestamp, ...entryData } = entry;

            // Store as UTC ISO to avoid timezone ambiguity in DB
            const storedDatetime = this.toUTCISOStringFromLocal(datetime);
            
            const { error } = await supabaseClient
                .from('entries')
                .update({
                    type: type,
                    datetime: storedDatetime,
                    data: entryData
                })
                .eq('id', id)
                .eq('user_id', user.id);

            if (error) throw error;
        } catch (error) {
            console.error('Error updating entry:', error);
            alert('Unable to update entry: ' + error.message);
        }
    }

    async deleteEntryFromDB(entryId) {
        try {
            const { data: { user } } = await supabaseClient.auth.getUser();
            if (!user) throw new Error('User not authenticated');

            const { error } = await supabaseClient
                .from('entries')
                .delete()
                .eq('id', entryId)
                .eq('user_id', user.id);

            if (error) throw error;
        } catch (error) {
            console.error('Error deleting entry:', error);
            alert('Unable to delete entry: ' + error.message);
        }
    }

    async addEntry(entry) {
        try {
            const savedEntry = await this.saveEntry(entry);
            if (savedEntry) {
                // Reload entries from database to stay in sync
                this.entries = await this.loadEntries();
                this.updateQuickStats();
                this.updateBreastStats();
                this.displayRecentEntries();
            }
        } catch (error) {
            console.error('Error adding entry:', error);
        }
    }

    getEntriesByType(type) {
        return this.entries.filter(entry => entry.type === type);
    }

    getTodayEntries() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTimestamp = today.getTime();
        
        return this.entries.filter(entry => entry.timestamp >= todayTimestamp);
    }

    getLastEntry(type) {
        // Since entries are ordered by datetime (newest first), find the first match
        return this.entries.find(entry => entry.type === type);
    }

    formatTime(datetime) {
        const date = new Date(datetime);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays}d ago`;
        
        return date.toLocaleDateString(undefined, {
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        });
    }

    formatDateTime(datetime) {
        // Create date object and ensure it displays in user's local timezone
        const date = new Date(datetime);
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        });
    }

    // Normalize to the format required by input[type="datetime-local"] in LOCAL time: YYYY-MM-DDTHH:MM
    formatForDateTimeLocal(datetimeLike) {
        if (!datetimeLike) return '';
        const date = (datetimeLike instanceof Date) ? datetimeLike : new Date(datetimeLike);
        if (isNaN(date.getTime())) return '';
        // Convert to local wall time by removing tz offset, then slice
        const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
        return local.toISOString().slice(0, 16);
    }

    // Parse a 'YYYY-MM-DDTHH:MM' as local time
    parseLocalDateTime(localString) {
        if (!localString || typeof localString !== 'string') return null;
        const match = localString.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
        if (!match) {
            const fallback = new Date(localString);
            return isNaN(fallback.getTime()) ? null : fallback;
        }
        const [_, y, m, d, hh, mm] = match;
        return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), 0, 0);
    }

    // Convert local datetime string to a UTC ISO string for storage
    toUTCISOStringFromLocal(localString) {
        const localDate = this.parseLocalDateTime(localString);
        if (!localDate) return '';
        return localDate.toISOString();
    }

    // Epoch millis from local datetime string
    getTimestampFromLocal(localString) {
        const localDate = this.parseLocalDateTime(localString);
        return localDate ? localDate.getTime() : 0;
    }

    setupEventListeners() {
        // Quick action buttons
        document.getElementById('feedingBtn').addEventListener('click', () => this.showForm('feedingForm'));
        document.getElementById('pumpingBtn').addEventListener('click', () => this.showForm('pumpingForm'));
        document.getElementById('diaperBtn').addEventListener('click', () => this.showForm('diaperForm'));

        // Form submissions
        document.getElementById('feedingFormElement').addEventListener('submit', (e) => this.handleFeedingSubmit(e));
        document.getElementById('pumpingFormElement').addEventListener('submit', (e) => this.handlePumpingSubmit(e));
        document.getElementById('diaperFormElement').addEventListener('submit', (e) => this.handleDiaperSubmit(e));

        // Feeding type radio buttons
        document.querySelectorAll('input[name="feedingType"]').forEach(radio => {
            radio.addEventListener('change', (e) => this.toggleFeedingFields(e.target.value));
        });

        // Nursing breast radio buttons
        document.querySelectorAll('input[name="nursingBreast"]').forEach(radio => {
            radio.addEventListener('change', (e) => this.toggleNursingDurationFields(e.target.value));
        });

        // Pumping breast radio buttons
        document.querySelectorAll('input[name="pumpingBreast"]').forEach(radio => {
            radio.addEventListener('change', (e) => this.togglePumpingAmountFields(e.target.value));
        });

        // Diaper type radio buttons
        document.querySelectorAll('input[name="diaperType"]').forEach(radio => {
            radio.addEventListener('change', (e) => this.togglePoopColorField(e.target.value));
        });

        // History button
        document.getElementById('viewHistoryBtn').addEventListener('click', () => this.showHistory());

        // Filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.filterHistory(e.target.dataset.filter));
        });

        // Theme toggle
        document.getElementById('toggleTheme').addEventListener('click', () => this.toggleTheme());

        // Daily summary cards
        document.getElementById('todayFeedingsCard').addEventListener('click', () => this.showDailySummary('feeding'));
        document.getElementById('todayDiapersCard').addEventListener('click', () => this.showDailySummary('diaper'));

        // Reference button
        document.getElementById('referenceBtn').addEventListener('click', () => this.showReference());
        
        // Sign out button
        document.getElementById('signOutBtn').addEventListener('click', () => {
            if (window.authManager) {
                window.authManager.signOut();
            }
        });
    }

    showForm(formId) {
        // Hide all forms first
        document.querySelectorAll('.entry-form').forEach(form => form.classList.add('hidden'));
        
        // Show selected form
        document.getElementById(formId).classList.remove('hidden');
        
        // Set current time
        this.setDefaultDateTime();
        
        // Reset form-specific fields
        if (formId === 'feedingForm') {
            // Default to nursing with appropriate fields shown
            document.querySelector('input[name="feedingType"][value="nursing"]').checked = true;
            this.toggleFeedingFields('nursing');
            // Reset breast selection to both
            document.querySelector('input[name="nursingBreast"][value="both"]').checked = true;
            this.toggleNursingDurationFields('both');
        } else if (formId === 'diaperForm') {
            document.getElementById('poopColorField').classList.add('hidden');
        } else if (formId === 'pumpingForm') {
            // Default to both breasts
            document.querySelector('input[name="pumpingBreast"][value="both"]').checked = true;
            this.togglePumpingAmountFields('both');
        }
        
        // Scroll to form with a small delay to ensure it's visible
        setTimeout(() => {
            document.getElementById(formId).scrollIntoView({ 
                behavior: 'smooth',
                block: 'start'
            });
        }, 100);
    }

    hideForm(formId) {
        document.getElementById(formId).classList.add('hidden');
        // Clear editing flag
        this.editingEntryId = null;
        // Reset the form
        if (formId === 'feedingForm') {
            document.getElementById('feedingFormElement').reset();
        } else if (formId === 'diaperForm') {
            document.getElementById('diaperFormElement').reset();
        } else if (formId === 'pumpingForm') {
            document.getElementById('pumpingFormElement').reset();
        }
    }

    setDefaultDateTime() {
        const now = new Date();
        const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 16);
        
        document.getElementById('feedingTime').value = localDateTime;
        document.getElementById('pumpingTime').value = localDateTime;
        document.getElementById('diaperTime').value = localDateTime;
    }

    toggleFeedingFields(type) {
        const nursingFields = document.getElementById('nursingFields');
        const bottleFields = document.getElementById('bottleFields');
        
        if (type === 'nursing') {
            // Show only nursing fields
            nursingFields.classList.remove('hidden');
            bottleFields.classList.add('hidden');
        } else if (type === 'bottle') {
            // Show only bottle fields
            nursingFields.classList.add('hidden');
            bottleFields.classList.remove('hidden');
        } else if (type === 'both') {
            // Show both nursing and bottle fields
            nursingFields.classList.remove('hidden');
            bottleFields.classList.remove('hidden');
        }
    }

    togglePoopColorField(type) {
        const colorField = document.getElementById('poopColorField');
        
        if (type === 'poop' || type === 'both') {
            colorField.classList.remove('hidden');
        } else {
            colorField.classList.add('hidden');
        }
    }

    toggleNursingDurationFields(selectedBreast) {
        const singleField = document.getElementById('singleDurationField');
        const splitFields = document.getElementById('splitDurationFields');

        if (!singleField || !splitFields) return;

        if (selectedBreast === 'both') {
            singleField.classList.add('hidden');
            splitFields.classList.remove('hidden');
        } else {
            splitFields.classList.add('hidden');
            singleField.classList.remove('hidden');
        }
    }

    togglePumpingAmountFields(selectedBreast) {
        const singleField = document.getElementById('singleAmountField');
        const splitFields = document.getElementById('splitAmountFields');

        if (!singleField || !splitFields) return;

        if (selectedBreast === 'both') {
            singleField.classList.add('hidden');
            splitFields.classList.remove('hidden');
        } else {
            splitFields.classList.add('hidden');
            singleField.classList.remove('hidden');
        }
    }

    async handleFeedingSubmit(e) {
        e.preventDefault();
        
        const feedingTypeEl = document.querySelector('input[name="feedingType"]:checked');
        if (!feedingTypeEl) {
            alert('Please select a feeding type');
            return;
        }
        
        const feedingType = feedingTypeEl.value;
        const datetime = document.getElementById('feedingTime').value;
        
        if (!datetime) {
            alert('Please select a time');
            return;
        }
        
        const entry = {
            type: 'feeding',
            datetime: datetime,
            timestamp: this.getTimestampFromLocal(datetime),
            feedingType: feedingType
        };

        if (feedingType === 'nursing' || feedingType === 'both') {
            const nursingBreast = document.querySelector('input[name="nursingBreast"]:checked').value;
            entry.nursingBreast = nursingBreast;
            
            if (nursingBreast === 'both') {
                entry.leftDuration = parseInt(document.getElementById('leftDuration').value) || 0;
                entry.rightDuration = parseInt(document.getElementById('rightDuration').value) || 0;
                entry.totalDuration = entry.leftDuration + entry.rightDuration;
            } else {
                entry.totalDuration = parseInt(document.getElementById('nursingDuration').value) || 0;
            }
        }
        
        if (feedingType === 'bottle' || feedingType === 'both') {
            entry.bottleAmount = parseFloat(document.getElementById('bottleAmount').value) || 0;
            entry.bottleUnit = document.getElementById('bottleUnit').value;
        }

        // Check if we're editing or creating new
        if (this.editingEntryId) {
            // Update existing entry
            entry.id = this.editingEntryId;
            entry.timestamp = this.getTimestampFromLocal(entry.datetime);
            await this.updateEntry(entry);
            this.entries = await this.loadEntries();
            this.updateQuickStats();
            this.updateBreastStats();
            this.displayRecentEntries();
            // Update history if it's open
            if (!document.getElementById('historyModal').classList.contains('hidden')) {
                const activeFilter = document.querySelector('.filter-btn.active').dataset.filter;
                this.filterHistory(activeFilter);
            }
            this.editingEntryId = null; // Clear editing flag
        } else {
            // Create new entry
            await this.addEntry(entry);
        }

        this.hideForm('feedingForm');
        e.target.reset();
    }

    async handlePumpingSubmit(e) {
        e.preventDefault();
        
        const pumpingBreast = document.querySelector('input[name="pumpingBreast"]:checked').value;
        const datetime = document.getElementById('pumpingTime').value;
        
        if (!datetime) {
            alert('Please select a time');
            return;
        }
        
        const entry = {
            type: 'pumping',
            datetime: datetime,
            timestamp: this.getTimestampFromLocal(datetime),
            pumpingBreast: pumpingBreast
        };

        if (pumpingBreast === 'both') {
            entry.leftAmount = parseFloat(document.getElementById('leftAmount').value) || 0;
            entry.rightAmount = parseFloat(document.getElementById('rightAmount').value) || 0;
            entry.totalAmount = entry.leftAmount + entry.rightAmount;
            entry.unit = document.getElementById('splitPumpingUnit').value;
        } else {
            entry.totalAmount = parseFloat(document.getElementById('pumpingAmount').value) || 0;
            entry.unit = document.getElementById('pumpingUnit').value;
        }

        entry.duration = parseInt(document.getElementById('pumpingDuration').value) || 0;

        // Check if we're editing or creating new
        if (this.editingEntryId) {
            // Update existing entry
            entry.id = this.editingEntryId;
            entry.timestamp = this.getTimestampFromLocal(entry.datetime);
            await this.updateEntry(entry);
            this.entries = await this.loadEntries();
            this.updateQuickStats();
            this.updateBreastStats();
            this.displayRecentEntries();
            // Update history if it's open
            if (!document.getElementById('historyModal').classList.contains('hidden')) {
                const activeFilter = document.querySelector('.filter-btn.active').dataset.filter;
                this.filterHistory(activeFilter);
            }
            this.editingEntryId = null; // Clear editing flag
        } else {
            // Create new entry
            await this.addEntry(entry);
        }

        this.hideForm('pumpingForm');
        e.target.reset();
    }

    async handleDiaperSubmit(e) {
        e.preventDefault();
        
        const diaperTypeEl = document.querySelector('input[name="diaperType"]:checked');
        if (!diaperTypeEl) {
            alert('Please select a diaper type');
            return;
        }
        
        const diaperType = diaperTypeEl.value;
        const datetime = document.getElementById('diaperTime').value;
        
        if (!datetime) {
            alert('Please select a time');
            return;
        }
        
        const entry = {
            type: 'diaper',
            datetime: datetime,
            timestamp: this.getTimestampFromLocal(datetime),
            diaperType: diaperType
        };

        // Add poop color if applicable
        if (diaperType === 'poop' || diaperType === 'both') {
            const poopColor = document.getElementById('poopColor').value;
            if (poopColor) {
                entry.poopColor = poopColor;
            }
        }

        // Check if we're editing or creating new
        if (this.editingEntryId) {
            // Update existing entry
            entry.id = this.editingEntryId;
            entry.timestamp = this.getTimestampFromLocal(entry.datetime);
            await this.updateEntry(entry);
            this.entries = await this.loadEntries();
            this.updateQuickStats();
            this.displayRecentEntries();
            // Update history if it's open
            if (!document.getElementById('historyModal').classList.contains('hidden')) {
                const activeFilter = document.querySelector('.filter-btn.active').dataset.filter;
                this.filterHistory(activeFilter);
            }
            this.editingEntryId = null; // Clear editing flag
        } else {
            // Create new entry
            await this.addEntry(entry);
        }

        this.hideForm('diaperForm');
        e.target.reset();
    }

    updateQuickStats() {
        // Last feeding
        const lastFeeding = this.getLastEntry('feeding');
        const lastFeedingEl = document.getElementById('lastFeeding');
        if (lastFeeding) {
            lastFeedingEl.textContent = this.formatTime(lastFeeding.datetime);
        } else {
            lastFeedingEl.textContent = '--';
        }

        // Last diaper
        const lastDiaper = this.getLastEntry('diaper');
        const lastDiaperEl = document.getElementById('lastDiaper');
        if (lastDiaper) {
            lastDiaperEl.textContent = this.formatTime(lastDiaper.datetime);
        } else {
            lastDiaperEl.textContent = '--';
        }

        // Today's counts
        const todayEntries = this.getTodayEntries();
        const todayFeedings = todayEntries.filter(e => e.type === 'feeding').length;
        const todayDiapers = todayEntries.filter(e => e.type === 'diaper').length;
        
        document.getElementById('todayFeedings').textContent = todayFeedings;
        document.getElementById('todayDiapers').textContent = todayDiapers;
    }

    updateBreastStats() {
        // Aggregate today's nursing minutes and pumped amounts per breast
        const todayEntries = this.getTodayEntries();

        let leftNursingMins = 0;
        let rightNursingMins = 0;
        let leftPumpedMl = 0;
        let rightPumpedMl = 0;

        let lastUsedLeftTs = null;
        let lastUsedRightTs = null;

        // Helper to convert oz to ml
        const toMl = (amount, unit) => {
            if (!amount) return 0;
            if (unit === 'oz') return amount * 29.5735;
            return amount; // assume ml
        };

        for (const entry of todayEntries) {
            if (entry.type === 'feeding') {
                // Nursing contributions
                if (entry.feedingType === 'nursing' || entry.feedingType === 'both') {
                    if (entry.nursingBreast === 'both') {
                        leftNursingMins += Number(entry.leftDuration || 0);
                        rightNursingMins += Number(entry.rightDuration || 0);
                        // both breasts used at this time
                        const ts = Number(entry.timestamp);
                        if (!isNaN(ts)) {
                            lastUsedLeftTs = Math.max(lastUsedLeftTs ?? 0, ts);
                            lastUsedRightTs = Math.max(lastUsedRightTs ?? 0, ts);
                        }
                    } else if (entry.nursingBreast === 'left') {
                        leftNursingMins += Number(entry.totalDuration || 0);
                        const ts = Number(entry.timestamp);
                        if (!isNaN(ts)) lastUsedLeftTs = Math.max(lastUsedLeftTs ?? 0, ts);
                    } else if (entry.nursingBreast === 'right') {
                        rightNursingMins += Number(entry.totalDuration || 0);
                        const ts = Number(entry.timestamp);
                        if (!isNaN(ts)) lastUsedRightTs = Math.max(lastUsedRightTs ?? 0, ts);
                    }
                }
            } else if (entry.type === 'pumping') {
                // Pumping contributions
                if (entry.pumpingBreast === 'both') {
                    leftPumpedMl += toMl(Number(entry.leftAmount || 0), entry.unit);
                    rightPumpedMl += toMl(Number(entry.rightAmount || 0), entry.unit);
                    const ts = Number(entry.timestamp);
                    if (!isNaN(ts)) {
                        lastUsedLeftTs = Math.max(lastUsedLeftTs ?? 0, ts);
                        lastUsedRightTs = Math.max(lastUsedRightTs ?? 0, ts);
                    }
                } else if (entry.pumpingBreast === 'left') {
                    leftPumpedMl += toMl(Number(entry.totalAmount || 0), entry.unit);
                    const ts = Number(entry.timestamp);
                    if (!isNaN(ts)) lastUsedLeftTs = Math.max(lastUsedLeftTs ?? 0, ts);
                } else if (entry.pumpingBreast === 'right') {
                    rightPumpedMl += toMl(Number(entry.totalAmount || 0), entry.unit);
                    const ts = Number(entry.timestamp);
                    if (!isNaN(ts)) lastUsedRightTs = Math.max(lastUsedRightTs ?? 0, ts);
                }
            }
        }

        // Update UI
        const leftNursingEl = document.getElementById('leftNursingTime');
        const rightNursingEl = document.getElementById('rightNursingTime');
        const leftPumpedEl = document.getElementById('leftPumpedAmount');
        const rightPumpedEl = document.getElementById('rightPumpedAmount');
        const leftLastUsedEl = document.getElementById('leftLastUsed');
        const rightLastUsedEl = document.getElementById('rightLastUsed');
        const recommendationEl = document.getElementById('breastRecommendation');

        if (leftNursingEl) leftNursingEl.textContent = `${Math.round(leftNursingMins)} min`;
        if (rightNursingEl) rightNursingEl.textContent = `${Math.round(rightNursingMins)} min`;

        if (leftPumpedEl) leftPumpedEl.textContent = `${Math.round(leftPumpedMl)} ml`;
        if (rightPumpedEl) rightPumpedEl.textContent = `${Math.round(rightPumpedMl)} ml`;

        if (leftLastUsedEl) leftLastUsedEl.textContent = lastUsedLeftTs ? this.formatTime(lastUsedLeftTs) : '--';
        if (rightLastUsedEl) rightLastUsedEl.textContent = lastUsedRightTs ? this.formatTime(lastUsedRightTs) : '--';

        if (recommendationEl) {
            let recommendation = 'Either breast';
            if (lastUsedLeftTs && lastUsedRightTs) {
                if (lastUsedLeftTs > lastUsedRightTs) recommendation = 'Start with: Right breast';
                else if (lastUsedRightTs > lastUsedLeftTs) recommendation = 'Start with: Left breast';
                else recommendation = 'Start with: Either breast';
            } else if (lastUsedLeftTs && !lastUsedRightTs) {
                recommendation = 'Start with: Right breast';
            } else if (!lastUsedLeftTs && lastUsedRightTs) {
                recommendation = 'Start with: Left breast';
            } else {
                recommendation = 'Start with: Either breast';
            }
            recommendationEl.textContent = recommendation;
        }
    }

    displayRecentEntries() {
        const container = document.getElementById('recentEntries');
        
        // Group entries by date
        const groupedEntries = this.groupEntriesByDate(this.entries.slice(0, 30)); // Show last 30 entries
        
        let html = '';
        const today = new Date().toDateString();
        
        // Sort dates in reverse chronological order (newest first)
        const sortedDates = Object.keys(groupedEntries).sort((a, b) => {
            return new Date(b) - new Date(a);
        });
        
        for (const date of sortedDates) {
            const entries = groupedEntries[date];
            const dateObj = new Date(date);
            const isToday = dateObj.toDateString() === today;
            const dateId = date.replace(/\s/g, '-');
            
            // Format date header
            let dateLabel = this.formatDateHeader(dateObj);
            
            // Count summaries
            const feedingCount = entries.filter(e => e.type === 'feeding').length;
            const diaperCount = entries.filter(e => e.type === 'diaper').length;
            
            html += `
                <div class="date-group">
                    <div class="date-header ${isToday ? 'expanded' : ''}" onclick="tracker.toggleDateGroup('${dateId}')">
                        <span class="date-label">${dateLabel}</span>
                        <span class="date-summary">
                            🍼 ${feedingCount} · 👶 ${diaperCount}
                        </span>
                        <span class="expand-icon">▼</span>
                    </div>
                    <div id="date-${dateId}" class="date-entries ${isToday ? '' : 'collapsed'}">
                        ${entries.map(entry => this.createEntryHTML(entry)).join('')}
                    </div>
                </div>
            `;
        }
        
        container.innerHTML = html || '<p style="text-align: center; opacity: 0.6;">No entries yet</p>';
    }
    
    groupEntriesByDate(entries) {
        const grouped = {};
        
        entries.forEach(entry => {
            const date = new Date(entry.datetime).toDateString();
            if (!grouped[date]) {
                grouped[date] = [];
            }
            grouped[date].push(entry);
        });
        
        return grouped;
    }
    
    formatDateHeader(date) {
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        if (date.toDateString() === today.toDateString()) {
            return 'Today';
        } else if (date.toDateString() === yesterday.toDateString()) {
            return 'Yesterday';
        } else {
            return date.toLocaleDateString('en-US', { 
                weekday: 'short', 
                month: 'short', 
                day: 'numeric' 
            });
        }
    }
    
    toggleDateGroup(dateId) {
        const container = document.getElementById(`date-${dateId}`);
        const header = container.previousElementSibling;
        
        if (container.classList.contains('collapsed')) {
            container.classList.remove('collapsed');
            header.classList.add('expanded');
        } else {
            container.classList.add('collapsed');
            header.classList.remove('expanded');
        }
    }

    createEntryHTML(entry) {
        let icon, details;
        
        if (entry.type === 'feeding') {
            icon = '🍼';
            if (entry.feedingType === 'nursing') {
                const breastText = entry.nursingBreast === 'both' ? 
                    `L: ${entry.leftDuration}min, R: ${entry.rightDuration}min` : 
                    `${entry.nursingBreast} - ${entry.totalDuration} min`;
                details = `Nursing - ${breastText}`;
            } else if (entry.feedingType === 'both') {
                const breastText = entry.nursingBreast === 'both' ? 
                    `${entry.leftDuration + entry.rightDuration}min` : 
                    `${entry.totalDuration}min`;
                details = `Nursing (${breastText}) + Bottle (${entry.bottleAmount} ${entry.bottleUnit})`;
            } else if (entry.feedingType === 'bottle') {
                details = `Bottle - ${entry.bottleAmount} ${entry.bottleUnit}`;
            } else {
                // Legacy format support
                if (entry.feedingType === 'breast') {
                    details = `Nursing - ${entry.duration} min`;
                } else if (entry.amount) {
                    details = `${entry.feedingType} - ${entry.amount} ${entry.unit}`;
                } else {
                    details = entry.feedingType;
                }
            }
        } else if (entry.type === 'pumping') {
            icon = '🤱';
            if (entry.pumpingBreast === 'both') {
                details = `Pumping - L: ${entry.leftAmount}${entry.unit}, R: ${entry.rightAmount}${entry.unit}`;
            } else {
                details = `Pumping - ${entry.pumpingBreast}: ${entry.totalAmount} ${entry.unit}`;
            }
        } else {
            // Different icons for different diaper types
            if (entry.diaperType === 'wet') {
                icon = '💧';
            } else if (entry.diaperType === 'poop') {
                icon = '💩';
            } else {
                icon = '🚼'; // both
            }
            details = entry.diaperType;
            if (entry.poopColor) {
                details += ` (${entry.poopColor})`;
            }
        }

        return `
            <div class="entry-item" onclick="tracker.showEntryDetail(${entry.id})">
                <span class="entry-icon">${icon}</span>
                <div class="entry-details">
                    <div>${details}</div>
                    <div class="entry-time">${this.formatDateTime(entry.datetime)}</div>
                </div>
            </div>
        `;
    }

    showHistory() {
        document.getElementById('historyModal').classList.remove('hidden');
        this.filterHistory('all');
    }

    hideHistory() {
        document.getElementById('historyModal').classList.add('hidden');
    }

    filterHistory(filter) {
        // Update active button
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });

        // Filter entries for last 60 days
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
        const sixtyDaysTimestamp = sixtyDaysAgo.getTime();

        let filtered = this.entries.filter(entry => entry.timestamp >= sixtyDaysTimestamp);
        
        if (filter !== 'all') {
            filtered = filtered.filter(entry => entry.type === filter);
        }

        // Display filtered entries
        const container = document.getElementById('historyList');
        container.innerHTML = filtered.map(entry => this.createEntryHTML(entry)).join('');
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        
        // Update theme icon
        document.getElementById('toggleTheme').textContent = newTheme === 'dark' ? '☀️' : '🌙';
    }

    loadTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        document.getElementById('toggleTheme').textContent = savedTheme === 'dark' ? '☀️' : '🌙';
    }

    showDailySummary(type) {
        const todayEntries = this.getTodayEntries()
            .filter(entry => entry.type === type)
            .sort((a, b) => a.timestamp - b.timestamp); // Oldest first

        const modal = document.getElementById('dailySummaryModal');
        const title = document.getElementById('dailySummaryTitle');
        const container = document.getElementById('dailySummaryList');

        title.textContent = type === 'feeding' ? "Today's Feedings" : "Today's Diapers";

        if (todayEntries.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--text); opacity: 0.6;">No entries yet today</p>';
        } else {
            container.innerHTML = todayEntries.map(entry => this.createEntryHTML(entry)).join('');
        }

        modal.classList.remove('hidden');
    }

    showReference() {
        document.getElementById('referenceModal').classList.remove('hidden');
    }

    showEntryDetail(entryId) {
        const entry = this.entries.find(e => e.id === entryId);
        if (!entry) return;

        // Store current entry for editing
        this.currentEntry = entry;

        // Build detail content
        let detailHTML = '';
        const date = new Date(entry.datetime);
        
        // Get appropriate icon
        let typeIcon;
        let typeLabel;
        if (entry.type === 'feeding') {
            typeIcon = '🍼';
            typeLabel = 'Feeding';
        } else if (entry.type === 'pumping') {
            typeIcon = '🤱';
            typeLabel = 'Pumping';
        } else {
            if (entry.diaperType === 'wet') {
                typeIcon = '💧';
            } else if (entry.diaperType === 'poop') {
                typeIcon = '💩';
            } else {
                typeIcon = '🚼';
            }
            typeLabel = 'Diaper';
        }
        
        detailHTML += `<div class="detail-row">
            <span class="detail-label">Type</span>
            <span class="detail-value">${typeIcon} ${typeLabel}</span>
        </div>`;
        
        detailHTML += `<div class="detail-row">
            <span class="detail-label">Time</span>
            <span class="detail-value">${this.formatDateTime(entry.datetime)}</span>
        </div>`;

        if (entry.type === 'feeding') {
            // Display feeding details
            if (entry.feedingType === 'nursing' || entry.feedingType === 'both') {
                detailHTML += `<div class="detail-row">
                    <span class="detail-label">Nursing</span>
                    <span class="detail-value">${entry.nursingBreast === 'both' ? 
                        `Both (L: ${entry.leftDuration}min, R: ${entry.rightDuration}min)` : 
                        `${entry.nursingBreast} (${entry.totalDuration} min)`}</span>
                </div>`;
            }
            
            if (entry.feedingType === 'bottle' || entry.feedingType === 'both') {
                detailHTML += `<div class="detail-row">
                    <span class="detail-label">Bottle</span>
                    <span class="detail-value">${entry.bottleAmount} ${entry.bottleUnit} (${entry.bottleContents || 'unknown'})</span>
                </div>`;
            }
            
            // Legacy format support
            if (!entry.feedingType || (entry.feedingType !== 'nursing' && entry.feedingType !== 'bottle' && entry.feedingType !== 'both')) {
                detailHTML += `<div class="detail-row">
                    <span class="detail-label">Type</span>
                    <span class="detail-value">${entry.feedingType}</span>
                </div>`;
                
                if (entry.duration) {
                    detailHTML += `<div class="detail-row">
                        <span class="detail-label">Duration</span>
                        <span class="detail-value">${entry.duration} minutes</span>
                    </div>`;
                }
                
                if (entry.amount) {
                    detailHTML += `<div class="detail-row">
                        <span class="detail-label">Amount</span>
                        <span class="detail-value">${entry.amount} ${entry.unit}</span>
                    </div>`;
                }
            }
        } else if (entry.type === 'pumping') {
            detailHTML += `<div class="detail-row">
                <span class="detail-label">Breast</span>
                <span class="detail-value">${entry.pumpingBreast === 'both' ? 
                    `Both (L: ${entry.leftAmount}${entry.unit}, R: ${entry.rightAmount}${entry.unit})` : 
                    `${entry.pumpingBreast} (${entry.totalAmount} ${entry.unit})`}</span>
            </div>`;
            
            if (entry.duration) {
                detailHTML += `<div class="detail-row">
                    <span class="detail-label">Duration</span>
                    <span class="detail-value">${entry.duration} minutes</span>
                </div>`;
            }
        } else {
            detailHTML += `<div class="detail-row">
                <span class="detail-label">Type</span>
                <span class="detail-value">${entry.diaperType}</span>
            </div>`;
            
            if (entry.poopColor) {
                detailHTML += `<div class="detail-row">
                    <span class="detail-label">Color</span>
                    <span class="detail-value">${entry.poopColor}</span>
                </div>`;
            }
        }

        document.getElementById('entryDetailContent').innerHTML = detailHTML;
        document.getElementById('entryDetailModal').classList.remove('hidden');

        // Set up edit and delete buttons
        document.getElementById('editEntryBtn').onclick = () => this.editEntry(entryId);
        document.getElementById('deleteEntryBtn').onclick = () => this.deleteEntry(entryId);
    }

    editEntry(entryId) {
        const entry = this.entries.find(e => e.id === entryId);
        if (!entry) return;

        // Hide detail modal
        document.getElementById('entryDetailModal').classList.add('hidden');

        // Show appropriate form
        if (entry.type === 'feeding') {
            this.showForm('feedingForm');
            
            // Pre-fill form values
            document.getElementById('feedingTime').value = this.formatForDateTimeLocal(entry.datetime);
            
            // Handle new feeding types
            if (entry.feedingType === 'nursing' || entry.feedingType === 'bottle' || entry.feedingType === 'both') {
                document.querySelector(`input[name="feedingType"][value="${entry.feedingType}"]`).checked = true;
                this.toggleFeedingFields(entry.feedingType);
                
                if (entry.feedingType === 'nursing' || entry.feedingType === 'both') {
                    document.querySelector(`input[name="nursingBreast"][value="${entry.nursingBreast}"]`).checked = true;
                    this.toggleNursingDurationFields(entry.nursingBreast);
                    
                    if (entry.nursingBreast === 'both') {
                        document.getElementById('leftDuration').value = entry.leftDuration;
                        document.getElementById('rightDuration').value = entry.rightDuration;
                    } else {
                        document.getElementById('nursingDuration').value = entry.totalDuration;
                    }
                }
                
                if (entry.feedingType === 'bottle' || entry.feedingType === 'both') {
                    document.getElementById('bottleAmount').value = entry.bottleAmount;
                    document.getElementById('bottleUnit').value = entry.bottleUnit;
                }
            } else {
                // Legacy format support
                const mappedType = entry.feedingType === 'breast' ? 'nursing' : 
                                  entry.feedingType === 'pumped' ? 'bottle' : 
                                  entry.feedingType === 'formula' ? 'bottle' : 'bottle';
                document.querySelector(`input[name="feedingType"][value="${mappedType}"]`).checked = true;
                this.toggleFeedingFields(mappedType);
                
                if (entry.duration) {
                    document.getElementById('nursingDuration').value = entry.duration;
                }
                if (entry.amount) {
                    document.getElementById('bottleAmount').value = entry.amount;
                    document.getElementById('bottleUnit').value = entry.unit;
                }
            }
        } else if (entry.type === 'pumping') {
            this.showForm('pumpingForm');
            
            // Pre-fill form values
            document.getElementById('pumpingTime').value = this.formatForDateTimeLocal(entry.datetime);
            document.querySelector(`input[name="pumpingBreast"][value="${entry.pumpingBreast}"]`).checked = true;
            
            this.togglePumpingAmountFields(entry.pumpingBreast);
            
            if (entry.pumpingBreast === 'both') {
                document.getElementById('leftAmount').value = entry.leftAmount;
                document.getElementById('rightAmount').value = entry.rightAmount;
                document.getElementById('splitPumpingUnit').value = entry.unit;
            } else {
                document.getElementById('pumpingAmount').value = entry.totalAmount;
                document.getElementById('pumpingUnit').value = entry.unit;
            }
            
            if (entry.duration) {
                document.getElementById('pumpingDuration').value = entry.duration;
            }
        } else {
            this.showForm('diaperForm');
            
            // Pre-fill form values
            document.getElementById('diaperTime').value = this.formatForDateTimeLocal(entry.datetime);
            document.querySelector(`input[name="diaperType"][value="${entry.diaperType}"]`).checked = true;
            
            // Trigger the toggle to show color field if needed
            this.togglePoopColorField(entry.diaperType);
            
            if (entry.poopColor) {
                document.getElementById('poopColor').value = entry.poopColor;
            }
        }

        // Store the entry ID we're editing
        this.editingEntryId = entryId;
    }

    async deleteEntry(entryId) {
        if (confirm('Are you sure you want to delete this entry?')) {
            // Delete from database and reload entries
            await this.deleteEntryFromDB(entryId);
            this.entries = await this.loadEntries();
            this.updateQuickStats();
            this.updateBreastStats();
            this.displayRecentEntries();
            
            // Hide detail modal
            document.getElementById('entryDetailModal').classList.add('hidden');
            
            // If we're in history view, update it
            if (!document.getElementById('historyModal').classList.contains('hidden')) {
                const activeFilter = document.querySelector('.filter-btn.active').dataset.filter;
                this.filterHistory(activeFilter);
            }
        }
    }

}

// Global functions for inline event handlers
function hideForm(formId) {
    document.getElementById(formId).classList.add('hidden');
    // Clear editing flag if hiding form
    if (tracker && tracker.editingEntryId) {
        tracker.editingEntryId = null;
    }
}

function hideHistory() {
    document.getElementById('historyModal').classList.add('hidden');
}

function hideDailySummary() {
    document.getElementById('dailySummaryModal').classList.add('hidden');
}

function hideReference() {
    document.getElementById('referenceModal').classList.add('hidden');
}

function hideEntryDetail() {
    document.getElementById('entryDetailModal').classList.add('hidden');
}

// Initialize app
window.authManager = new AuthManager();