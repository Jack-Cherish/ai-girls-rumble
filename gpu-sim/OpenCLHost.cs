// Windows PowerShell compiles this local runner once per process. No SDK is needed on the player PC.
using System;
using System.IO;
using System.Text;
using System.Runtime.InteropServices;
using System.Collections.Generic;

public static class DuelCompute {
    const string CL = "OpenCL.dll";
    [DllImport(CL)] static extern int clGetPlatformIDs(uint n, [Out] IntPtr[] platforms, out uint count);
    [DllImport(CL)] static extern int clGetDeviceIDs(IntPtr p, ulong type, uint n, [Out] IntPtr[] devices, out uint count);
    [DllImport(CL)] static extern int clGetDeviceInfo(IntPtr dev, uint key, IntPtr size, [Out] byte[] value, out IntPtr actual);
    [DllImport(CL)] static extern IntPtr clCreateContext(IntPtr props, uint n, IntPtr[] devs, IntPtr callback, IntPtr user, out int err);
    [DllImport(CL)] static extern IntPtr clCreateCommandQueue(IntPtr ctx, IntPtr dev, ulong flags, out int err);
    [DllImport(CL)] static extern IntPtr clCreateProgramWithSource(IntPtr ctx, uint n, IntPtr[] texts, IntPtr lengths, out int err);
    [DllImport(CL,CharSet=CharSet.Ansi,ExactSpelling=true)] static extern int clBuildProgram(IntPtr prog, uint n, IntPtr[] devs, string options, IntPtr notify, IntPtr user);
    [DllImport(CL)] static extern int clGetProgramBuildInfo(IntPtr prog, IntPtr dev,uint key,IntPtr size,[Out] byte[] data,out IntPtr actual);
    [DllImport(CL,CharSet=CharSet.Ansi,ExactSpelling=true)] static extern IntPtr clCreateKernel(IntPtr prog, string name, out int err);
    [DllImport(CL)] static extern IntPtr clCreateBuffer(IntPtr ctx, ulong flags, IntPtr size, IntPtr host, out int err);
    [DllImport(CL,EntryPoint="clSetKernelArg")] static extern int SetBuffer(IntPtr k, uint slot, IntPtr size, ref IntPtr mem);
    [DllImport(CL,EntryPoint="clSetKernelArg")] static extern int SetInt(IntPtr k, uint slot, IntPtr size, ref int value);
    [DllImport(CL)] static extern int clEnqueueNDRangeKernel(IntPtr queue,IntPtr kernel,uint dim,IntPtr offset,IntPtr[] global,IntPtr local,uint waits,IntPtr events,IntPtr result);
    [DllImport(CL)] static extern int clEnqueueWriteBuffer(IntPtr queue,IntPtr buf,uint block,IntPtr offset,IntPtr size,[In] byte[] data,uint waits,IntPtr events,IntPtr result);
    [DllImport(CL)] static extern int clEnqueueReadBuffer(IntPtr queue,IntPtr buf,uint block,IntPtr offset,IntPtr size,[Out] byte[] data,uint waits,IntPtr events,IntPtr result);
    [DllImport(CL)] static extern int clReleaseMemObject(IntPtr b);
    [DllImport(CL)] static extern int clReleaseKernel(IntPtr k);
    [DllImport(CL)] static extern int clReleaseProgram(IntPtr p);
    [DllImport(CL)] static extern int clReleaseCommandQueue(IntPtr q);
    [DllImport(CL)] static extern int clReleaseContext(IntPtr c);
    static IntPtr ctx,queue,program,kernel;
    static int stateBytes;
    static readonly IntPtr Zero=IntPtr.Zero;
    static void Check(int e,string stage){if(e!=0)throw new Exception(stage+" (OpenCL "+e+")");}
    static string Enc(string s){return Convert.ToBase64String(Encoding.UTF8.GetBytes(s));}
    static byte[] Info(IntPtr d,uint key){
        IntPtr len;
        if(clGetDeviceInfo(d,key,Zero,null,out len)!=0 || len.ToInt64()<=0 || len.ToInt64()>65536)return new byte[0];
        byte[] data=new byte[len.ToInt32()];Check(clGetDeviceInfo(d,key,len,data,out len),"device info");return data;
    }
    static IntPtr FindGPU(){
        uint count;Check(clGetPlatformIDs(0,null,out count),"enumerate GPU platforms");
        IntPtr[] platforms=new IntPtr[count];Check(clGetPlatformIDs(count,platforms,out count),"list GPU platforms");
        IntPtr best=Zero;uint bestUnits=0;
        foreach(IntPtr platform in platforms){
            uint n; if(clGetDeviceIDs(platform,4,0,null,out n)!=0 || n==0)continue;
            IntPtr[] devices=new IntPtr[n];Check(clGetDeviceIDs(platform,4,n,devices,out n),"list GPUs");
            foreach(IntPtr dev in devices){
                byte[] fp64=Info(dev,0x1032),units=Info(dev,0x1002);
                if(fp64.Length<8||BitConverter.ToUInt64(fp64,0)==0)continue;
                uint score=units.Length>=4?BitConverter.ToUInt32(units,0):1;
                if(best==Zero||score>bestUnits){best=dev;bestUnits=score;}
            }
        }
        if(best==Zero)throw new Exception("No OpenCL GPU with FP64 support");return best;
    }
    static IntPtr BufferFor(int bytes){
        int e;IntPtr b=clCreateBuffer(ctx,1,(IntPtr)bytes,Zero,out e);Check(e,"allocate GPU buffer");return b;
    }
    static void Bind(IntPtr k,uint slot,IntPtr buffer){Check(SetBuffer(k,slot,(IntPtr)IntPtr.Size,ref buffer),"bind GPU buffer");}
    static void Dispatch(IntPtr k,int n){Check(clEnqueueNDRangeKernel(queue,k,1,Zero,new[]{(IntPtr)n},Zero,0,Zero,Zero),"dispatch GPU");}
    static void Upload(IntPtr b,byte[] data,int offset=0){Check(clEnqueueWriteBuffer(queue,b,1,(IntPtr)offset,(IntPtr)data.Length,data,0,Zero,Zero),"upload GPU data");}
    static void Read(IntPtr b,byte[] data,int offset=0){Check(clEnqueueReadBuffer(queue,b,1,(IntPtr)offset,(IntPtr)data.Length,data,0,Zero,Zero),"read GPU results");}
    static string Open(string file){
        IntPtr d=FindGPU();IntPtr[] ds={d};int e;
        ctx=clCreateContext(Zero,1,ds,Zero,Zero,out e);Check(e,"GPU context");
        queue=clCreateCommandQueue(ctx,d,0,out e);Check(e,"GPU queue");
        IntPtr src=Marshal.StringToHGlobalAnsi(File.ReadAllText(file));
        try{program=clCreateProgramWithSource(ctx,1,new[]{src},Zero,out e);Check(e,"GPU source");}finally{Marshal.FreeHGlobal(src);}
        e=clBuildProgram(program,1,ds,"-cl-std=CL1.2",Zero,Zero);
        if(e!=0){
            IntPtr len;clGetProgramBuildInfo(program,d,0x1183,Zero,null,out len);
            byte[] log=new byte[Math.Min(65536,Math.Max(1,len.ToInt32()))];clGetProgramBuildInfo(program,d,0x1183,(IntPtr)log.Length,log,out len);
            throw new Exception("GPU compiler: "+Encoding.UTF8.GetString(log).TrimEnd('\0'));
        }
        kernel=clCreateKernel(program,"simulate",out e);Check(e,"GPU battle kernel");
        IntPtr query=clCreateKernel(program,"stateSize",out e);Check(e,"GPU size kernel");
        IntPtr size=BufferFor(4);
        try{Bind(query,0,size);Dispatch(query,1);byte[] result=new byte[4];Read(size,result);stateBytes=BitConverter.ToInt32(result,0);}
        finally{clReleaseMemObject(size);clReleaseKernel(query);}
        if(stateBytes<1||stateBytes>65536)throw new Exception("Invalid GPU state layout");
        return Encoding.UTF8.GetString(Info(d,0x102B)).TrimEnd('\0');
    }
    const int MaxSlots=1024, MaxJobs=10000, RecordBytes=74*4;
    static List<IntPtr> buffers=new List<IntPtr>();
    static int width,submitted,reported;
    static void Reset(byte[] config,int capacity){
        if(config.Length!=960 || capacity<1 || capacity>MaxSlots)throw new Exception("Invalid GPU configuration");
        if(buffers.Count==0){
            foreach(int size in new[]{MaxSlots*stateBytes,MaxJobs*12,960,MaxJobs*RecordBytes,MaxSlots*4,12})
                buffers.Add(BufferFor(size));
            for(int i=0;i<buffers.Count;i++)Bind(kernel,(uint)i,buffers[i]);
            int ticks=96;Check(SetInt(kernel,6,(IntPtr)4,ref ticks),"frame step");
        }
        width=capacity;submitted=reported=0;
        Upload(buffers[2],config);
        Upload(buffers[4],new byte[width*4]);
        Upload(buffers[5],new byte[12]);
    }
    static byte[] Advance(byte[] tasks){
        int count=tasks.Length/12;
        if(width<1||tasks.Length%12!=0||submitted+count>MaxJobs)throw new Exception("Invalid queue size");
        if(count>0)Upload(buffers[1],tasks,submitted*12);
        submitted+=count;
        if(reported==submitted)throw new Exception("Empty queue");
        Check(SetInt(kernel,7,(IntPtr)4,ref submitted),"queue end");
        var counters=new byte[12];
        while(true){
            for(int i=0;i<4;i++)Dispatch(kernel,Math.Min(width,submitted));
            Read(buffers[5],counters);
            int finished=BitConverter.ToInt32(counters,4);
            if(BitConverter.ToInt32(counters,8)!=0 || finished<reported || finished>submitted)
                throw new Exception("GPU battle or completion counter out of bounds");
            if(finished==reported)continue;
            byte[] data=new byte[(finished-reported)*RecordBytes];
            Read(buffers[3],data,reported*RecordBytes);
            reported=finished;return data;
        }
    }
    public static void Serve(string file){
        try{
            Console.WriteLine("READY "+Enc(Open(file)));
            string line;while((line=Console.ReadLine())!=null){
                string[] a=line.Split(' ');if(a.Length!=3)throw new Exception("Invalid batch input");
                if(a[0]!="-")Reset(Convert.FromBase64String(a[0]),Int32.Parse(a[2]));
                byte[] words=Advance(a[1]=="-"?new byte[0]:Convert.FromBase64String(a[1]));
                Console.WriteLine("ROW "+Convert.ToBase64String(words));
            }
        }finally{
            foreach(IntPtr buf in buffers)clReleaseMemObject(buf);
            if(kernel!=Zero)clReleaseKernel(kernel);if(program!=Zero)clReleaseProgram(program);
            if(queue!=Zero)clReleaseCommandQueue(queue);if(ctx!=Zero)clReleaseContext(ctx);
        }
    }
}
