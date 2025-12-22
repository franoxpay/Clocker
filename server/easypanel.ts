// Using native fetch (available in Node.js 18+)

interface EasyPanelConfig {
  endpoint: string;
  token: string;
  projectName: string;
  serviceName: string;
}

interface DomainParams {
  host: string;
  https?: boolean;
  port?: number;
  path?: string;
}

interface EasyPanelDomainResult {
  success: boolean;
  error?: string;
  domainId?: string;
}

class EasyPanelService {
  private config: EasyPanelConfig | null = null;

  configure(config: EasyPanelConfig) {
    this.config = config;
  }

  isConfigured(): boolean {
    return !!(
      this.config?.endpoint &&
      this.config?.token &&
      this.config?.projectName &&
      this.config?.serviceName
    );
  }

  private async makeRequest(route: string, body: any): Promise<any> {
    if (!this.config) {
      throw new Error('EasyPanel not configured');
    }

    const url = `${this.config.endpoint}${route}?batch=1`;
    const trpcBody = {
      "0": body
    };

    console.log(`[EasyPanel] Making request to: ${url}`);
    console.log(`[EasyPanel] Request body:`, JSON.stringify(trpcBody, null, 2));

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.config.token,
      },
      body: JSON.stringify(trpcBody),
    });

    const text = await response.text();
    console.log(`[EasyPanel] Response status: ${response.status}`);
    console.log(`[EasyPanel] Response body: ${text}`);

    if (!response.ok) {
      throw new Error(`EasyPanel API error: ${response.status} - ${text}`);
    }

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  private async getRequest(route: string, params?: any): Promise<any> {
    if (!this.config) {
      throw new Error('EasyPanel not configured');
    }

    let url = `${this.config.endpoint}${route}?batch=1`;
    if (params) {
      const input = encodeURIComponent(JSON.stringify({ "0": params }));
      url += `&input=${input}`;
    }

    console.log(`[EasyPanel] GET request to: ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.config.token,
      },
    });

    const text = await response.text();
    console.log(`[EasyPanel] GET Response status: ${response.status}`);
    console.log(`[EasyPanel] GET Response body: ${text.substring(0, 500)}`);

    if (!response.ok) {
      throw new Error(`EasyPanel API error: ${response.status} - ${text}`);
    }

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  async getCurrentDomains(): Promise<DomainParams[]> {
    if (!this.config) {
      throw new Error('EasyPanel not configured');
    }

    try {
      const result = await this.getRequest('/api/trpc/services.app.inspectService', {
        json: {
          projectName: this.config.projectName,
          serviceName: this.config.serviceName,
        }
      });

      console.log('[EasyPanel] Inspect result structure:', JSON.stringify(result, null, 2).substring(0, 1000));
      
      // tRPC batch response format: [{ result: { data: { json: ... } } }]
      const domains = result?.[0]?.result?.data?.json?.domains || 
                      result?.result?.data?.json?.domains || 
                      [];
      console.log('[EasyPanel] Current domains:', domains);
      return domains;
    } catch (error) {
      console.error('[EasyPanel] Error getting current domains:', error);
      return [];
    }
  }

  async addDomain(domain: string, port: number = 80): Promise<EasyPanelDomainResult> {
    if (!this.isConfigured()) {
      console.log('[EasyPanel] Not configured, skipping domain addition');
      return { success: false, error: 'EasyPanel not configured' };
    }

    try {
      console.log(`[EasyPanel] Adding domain: ${domain}`);

      // Use the correct endpoint: domains.createDomain
      const payload = {
        json: {
          id: "",
          https: true,
          host: domain,
          path: "/",
          middlewares: [],
          certificateResolver: "",
          wildcard: false,
          destinationType: "service",
          serviceDestination: {
            protocol: "http",
            port: port,
            path: "/",
            projectName: this.config!.projectName,
            serviceName: this.config!.serviceName
          }
        }
      };

      const result = await this.makeRequest('/api/trpc/domains.createDomain', payload);

      console.log(`[EasyPanel] Successfully added domain: ${domain}`);
      console.log(`[EasyPanel] Create domain result:`, JSON.stringify(result));
      
      // Extract the domain ID from the response
      // tRPC batch response: [{ result: { data: { json: { id: "..." } } } }]
      const domainId = result?.[0]?.result?.data?.json?.id || 
                       result?.result?.data?.json?.id ||
                       null;
      
      console.log(`[EasyPanel] Domain ID: ${domainId}`);
      
      return { success: true, domainId };
    } catch (error: any) {
      console.error(`[EasyPanel] Error adding domain ${domain}:`, error);
      return { success: false, error: error.message };
    }
  }

  async removeDomain(domainId: string): Promise<EasyPanelDomainResult> {
    if (!this.isConfigured()) {
      console.log('[EasyPanel] Not configured, skipping domain removal');
      return { success: false, error: 'EasyPanel not configured' };
    }

    if (!domainId) {
      console.log('[EasyPanel] No domain ID provided, skipping removal');
      return { success: false, error: 'No EasyPanel domain ID' };
    }

    try {
      console.log(`[EasyPanel] Removing domain with ID: ${domainId}`);

      const payload = {
        json: {
          id: domainId
        }
      };

      await this.makeRequest('/api/trpc/domains.deleteDomain', payload);
      console.log(`[EasyPanel] Successfully removed domain: ${domainId}`);
      return { success: true };
    } catch (error: any) {
      console.error(`[EasyPanel] Error removing domain ${domainId}:`, error);
      return { success: false, error: error.message };
    }
  }

  async deployService(): Promise<void> {
    if (!this.config) {
      throw new Error('EasyPanel not configured');
    }

    try {
      console.log('[EasyPanel] Deploying service to apply changes...');
      
      await this.makeRequest('/api/trpc/services.app.deployService', {
        json: {
          projectName: this.config.projectName,
          serviceName: this.config.serviceName,
        }
      });

      console.log('[EasyPanel] Deploy triggered successfully');
    } catch (error) {
      console.error('[EasyPanel] Error deploying service:', error);
    }
  }
}

export const easypanelService = new EasyPanelService();

export function initEasyPanel() {
  const endpoint = process.env.EASYPANEL_URL;
  const token = process.env.EASYPANEL_TOKEN;
  const projectName = process.env.EASYPANEL_PROJECT_NAME;
  const serviceName = process.env.EASYPANEL_SERVICE_NAME;

  console.log('[EasyPanel] Checking configuration...');
  console.log(`[EasyPanel] EASYPANEL_URL: ${endpoint ? 'SET' : 'NOT SET'}`);
  console.log(`[EasyPanel] EASYPANEL_TOKEN: ${token ? 'SET (' + token.substring(0, 8) + '...)' : 'NOT SET'}`);
  console.log(`[EasyPanel] EASYPANEL_PROJECT_NAME: ${projectName || 'NOT SET'}`);
  console.log(`[EasyPanel] EASYPANEL_SERVICE_NAME: ${serviceName || 'NOT SET'}`);

  if (endpoint && token && projectName && serviceName) {
    easypanelService.configure({
      endpoint,
      token,
      projectName,
      serviceName,
    });
    console.log('[EasyPanel] Integration configured successfully');
  } else {
    console.log('[EasyPanel] Integration not configured - missing environment variables');
    console.log('[EasyPanel] Required: EASYPANEL_URL, EASYPANEL_TOKEN, EASYPANEL_PROJECT_NAME, EASYPANEL_SERVICE_NAME');
  }
}
